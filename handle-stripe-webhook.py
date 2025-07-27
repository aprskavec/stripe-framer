import os
import json
import time
import hashlib
import requests
import stripe
import logging
import functions_framework

# Configure logging
logging.basicConfig(level=logging.INFO)

# --- Combined Function to handle Stripe Webhooks and Meta Tracking ---
@functions_framework.http
def handle_stripe_webhook(request):
    """
    Combined webhook that:
    1. Updates customer names in Stripe
    2. Sends events to Meta Conversions API with enhanced tracking
    """
    
    # Set up Stripe API key and Webhook Secret
    stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
    
    # Meta configuration (optional - webhook still works without these)
    META_PIXEL_ID = os.environ.get('META_PIXEL_ID')
    META_ACCESS_TOKEN = os.environ.get('META_ACCESS_TOKEN')

    if request.method != 'POST':
        return 'Method Not Allowed', 405

    payload = request.data
    sig_header = request.headers.get('stripe-signature')
    
    try:
        event = stripe.Webhook.construct_event(
            payload=payload, sig_header=sig_header, secret=webhook_secret
        )
        logging.info(f"Webhook - Received event: {event['type']} - ID: {event.get('id')}")
    except ValueError as e:
        logging.error(f"Webhook - Invalid payload: {e}")
        return 'Invalid payload', 400
    except stripe.error.SignatureVerificationError as e:
        logging.error(f"Webhook - Invalid signature: {e}")
        return 'Invalid signature', 400

    # Handle customer.created event for Lead tracking
    if event['type'] == 'customer.created' and META_PIXEL_ID and META_ACCESS_TOKEN:
        customer = event['data']['object']
        customer_email = customer.get('email')
        customer_metadata = customer.get('metadata', {})
        
        # Only send Lead event if this is from lead capture (not checkout)
        if customer_email and customer_metadata.get('source') in ['lead_capture_step_1', 'email_capture_step']:
            try:
                user_data = build_meta_user_data(
                    email=customer_email,
                    customer_id=customer.get('id'),
                    session_metadata=customer_metadata
                )
                
                send_meta_event(
                    event_name="Lead",
                    event_id=f"lead_{customer.get('id')}",
                    user_data=user_data,
                    custom_data={
                        "content_name": "Email Signup",
                        "content_category": "Lead Generation",
                        "value": 0.0,
                        "currency": "USD",
                        "lead_source": customer_metadata.get('source', 'unknown'),
                        "locale": customer_metadata.get('locale', '')
                    }
                )
                logging.info(f"Lead event sent for customer {customer.get('id')}")
            except Exception as e:
                logging.error(f"Failed to send Lead event for customer.created: {e}")

    # Handle the checkout.session.completed event
    elif event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        session_id = session.get('id')
        customer_id = session.get('customer')
        customer_details = session.get('customer_details', {})

        # Task 1: Update customer name in Stripe (original functionality)
        if customer_id and customer_details:
            customer_name = customer_details.get('name')
            if customer_name:
                try:
                    stripe.Customer.modify(
                        customer_id,
                        name=customer_name
                    )
                    logging.info(f"Successfully updated name for customer {customer_id} to '{customer_name}'")
                except Exception as e:
                    logging.error(f"Failed to update customer name for {customer_id}: {e}")
        
        # Task 2: Send to Meta Conversions API (if configured)
        if META_PIXEL_ID and META_ACCESS_TOKEN:
            try:
                # Retrieve full session with metadata for Meta tracking
                full_session = stripe.checkout.Session.retrieve(session_id)
                session_metadata = full_session.get('metadata', {})
                logging.info(f"Session metadata for Meta: {json.dumps(session_metadata)}")
                
                # Get email
                email = customer_details.get('email')
                if not email:
                    logging.warning(f"No email found for session {session_id}")
                
                # Build user data for Meta
                user_data = build_meta_user_data(
                    email=email,
                    customer_details=customer_details,
                    customer_id=customer_id,
                    session_metadata=session_metadata
                )
                
                # Send events to Meta
                amount = session.get('amount_total', 0) / 100.0
                currency = session.get('currency', 'usd').upper()
                is_upsell = session_metadata.get('is_upsell') == 'true'
                
                if is_upsell:
                    # Send only Purchase for upsells
                    send_meta_event(
                        event_name="Purchase",
                        event_id=f"upsell_purchase_{session_id}",
                        user_data=user_data,
                        custom_data={
                            "currency": currency,
                            "value": amount,
                            "content_type": "product",
                            "content_name": "Captain English Lifetime Access",
                            "content_ids": ["captain_english_lifetime"],
                            "contents": [{"id": "captain_english_lifetime", "quantity": 1}],
                            "num_items": 1
                        }
                    )
                else:
                    # Send StartTrial and Purchase for regular subscriptions
                    send_meta_event(
                        event_name="StartTrial",
                        event_id=f"trial_{session_id}",
                        user_data=user_data,
                        custom_data={
                            "currency": currency,
                            "value": 0.00,
                            "content_type": "product",
                            "content_name": "Captain English Pro Trial",
                            "content_ids": ["captain_english_pro"],
                            "contents": [{"id": "captain_english_pro", "quantity": 1}],
                            "num_items": 1
                        }
                    )
                    
                    send_meta_event(
                        event_name="Purchase",
                        event_id=f"purchase_{session_id}",
                        user_data=user_data,
                        custom_data={
                            "currency": currency,
                            "value": amount if amount > 0 else 0.01,
                            "content_type": "product",
                            "content_name": "Captain English Pro Trial",
                            "content_ids": ["captain_english_pro"],
                            "contents": [{"id": "captain_english_pro", "quantity": 1}],
                            "num_items": 1
                        }
                    )
                    
            except Exception as e:
                logging.error(f"Failed to send to Meta: {e}")
                # Don't fail the webhook if Meta sending fails
    
    # Handle invoice.payment_succeeded (for Subscribe event)
    elif event['type'] == 'invoice.payment_succeeded' and META_PIXEL_ID and META_ACCESS_TOKEN:
        invoice = event['data']['object']
        
        if invoice.get('amount_paid', 0) > 0 and invoice.get('subscription'):
            billing_reason = invoice.get('billing_reason')
            if billing_reason in ['subscription_create', 'subscription_cycle', 'subscription_update']:
                try:
                    email = invoice.get('customer_email')
                    customer_id = invoice.get('customer')
                    
                    if not email and customer_id:
                        customer = stripe.Customer.retrieve(customer_id)
                        email = customer.get('email')
                    
                    if email:
                        # Get customer metadata for tracking
                        customer = stripe.Customer.retrieve(customer_id) if customer_id else None
                        customer_metadata = customer.get('metadata', {}) if customer else {}
                        
                        user_data = build_meta_user_data(
                            email=email,
                            customer_id=customer_id,
                            session_metadata=customer_metadata
                        )
                        
                        amount_paid = invoice.get('amount_paid', 0) / 100.0
                        currency = invoice.get('currency', 'usd').upper()
                        
                        send_meta_event(
                            event_name="Subscribe",
                            event_id=f"subscribe_{invoice.get('id')}",
                            user_data=user_data,
                            custom_data={
                                "currency": currency,
                                "value": amount_paid,
                                "content_type": "product",
                                "content_name": "Captain English Pro Subscription",
                                "content_ids": ["captain_english_pro_subscription"],
                                "contents": [{"id": "captain_english_pro_subscription", "quantity": 1}],
                                "num_items": 1,
                                "predicted_ltv": amount_paid * 12
                            }
                        )
                        
                except Exception as e:
                    logging.error(f"Failed to process invoice payment for Meta: {e}")
    
    # Handle subscription cancellation
    elif event['type'] == 'customer.subscription.deleted' and META_PIXEL_ID and META_ACCESS_TOKEN:
        subscription = event['data']['object']
        customer_id = subscription.get('customer')
        
        try:
            customer = stripe.Customer.retrieve(customer_id)
            email = customer.get('email')
            customer_metadata = customer.get('metadata', {})
            
            if email:
                user_data = build_meta_user_data(
                    email=email,
                    customer_id=customer_id,
                    session_metadata=customer_metadata
                )
                
                send_meta_event(
                    event_name="CancelSubscription",
                    event_id=f"cancel_{subscription.get('id')}",
                    user_data=user_data,
                    custom_data={
                        "subscription_id": subscription.get('id'),
                        "cancel_at_period_end": subscription.get('cancel_at_period_end', False),
                        "content_type": "product",
                        "content_name": "Captain English Pro Subscription"
                    }
                )
                
        except Exception as e:
            logging.error(f"Failed to process subscription cancellation for Meta: {e}")
    
    # Handle refunds
    elif event['type'] == 'charge.refunded' and META_PIXEL_ID and META_ACCESS_TOKEN:
        charge = event['data']['object']
        customer_id = charge.get('customer')
        
        try:
            customer = stripe.Customer.retrieve(customer_id)
            email = customer.get('email')
            customer_metadata = customer.get('metadata', {})
            
            if email:
                user_data = build_meta_user_data(
                    email=email,
                    customer_id=customer_id,
                    session_metadata=customer_metadata
                )
                
                refund_amount = charge.get('amount_refunded', 0) / 100.0
                currency = charge.get('currency', 'usd').upper()
                
                send_meta_event(
                    event_name="Refund",
                    event_id=f"refund_{charge.get('id')}",
                    user_data=user_data,
                    custom_data={
                        "currency": currency,
                        "value": refund_amount,
                        "refund_reason": charge.get('refunds', {}).get('data', [{}])[0].get('reason', 'unknown'),
                        "content_type": "product",
                        "content_name": "Captain English Pro"
                    }
                )
                
        except Exception as e:
            logging.error(f"Failed to process refund for Meta: {e}")
    
    else:
        logging.info(f"Unhandled event type: {event['type']}")

    return 'OK', 200


# --- Helper Functions for Meta Integration ---

def build_meta_user_data(email=None, customer_details=None, customer_id=None, session_metadata=None):
    """Build user data for Meta Conversions API"""
    user_data = {}
    
    # Email (most important)
    if email:
        user_data["em"] = [hashlib.sha256(email.lower().strip().encode()).hexdigest()]
    
    # Meta tracking data from session metadata
    if session_metadata:
        # Client IP Address (Meta recommendation)
        if session_metadata.get('client_ip'):
            user_data["client_ip_address"] = session_metadata['client_ip']
            logging.info(f"Meta tracking - IP Address: {session_metadata['client_ip']}")
        
        # Facebook Click ID (Meta recommendation)
        if session_metadata.get('fbc'):
            user_data["fbc"] = session_metadata['fbc']
            logging.info(f"Meta tracking - Click ID (fbc): {session_metadata['fbc']}")
        elif session_metadata.get('fbclid'):
            # Convert fbclid to fbc format if only fbclid is stored
            fbc = f"fb.1.{int(time.time() * 1000)}.{session_metadata['fbclid']}"
            user_data["fbc"] = fbc
            logging.info(f"Meta tracking - Click ID (fbc) from fbclid: {fbc}")
        
        # Facebook Browser ID
        if session_metadata.get('fbp'):
            user_data["fbp"] = session_metadata['fbp']
            logging.info(f"Meta tracking - Browser ID (fbp): {session_metadata['fbp']}")

        # User Agent
        if session_metadata.get('user_agent'):
            user_data["client_user_agent"] = session_metadata['user_agent']
            logging.info(f"Meta tracking - User Agent: {session_metadata['user_agent'][:50]}...")  # Log first 50 chars
    
    # External ID for matching
    if customer_id:
        user_data["external_id"] = customer_id
    
    # Process customer details
    if customer_details:
        # Name
        if customer_details.get('name'):
            name_parts = customer_details['name'].split(' ', 1)
            if len(name_parts) > 0:
                user_data["fn"] = [hashlib.sha256(name_parts[0].lower().strip().encode()).hexdigest()]
            if len(name_parts) > 1:
                user_data["ln"] = [hashlib.sha256(name_parts[1].lower().strip().encode()).hexdigest()]
        
        # Phone
        if customer_details.get('phone'):
            phone = ''.join(filter(str.isdigit, customer_details['phone']))
            if phone:
                user_data["ph"] = [hashlib.sha256(phone.encode()).hexdigest()]
        
        # Address (especially State which Meta recommends)
        if customer_details.get('address'):
            address = customer_details['address']
            
            # State (Meta recommendation)
            if address.get('state'):
                state_code = address['state'].upper().strip()
                if len(state_code) == 2:
                    user_data["st"] = [hashlib.sha256(state_code.lower().encode()).hexdigest()]
                    logging.info(f"Meta tracking - State: {state_code}")
            
            # City
            if address.get('city'):
                user_data["ct"] = [hashlib.sha256(address['city'].lower().strip().encode()).hexdigest()]
            
            # Postal code
            if address.get('postal_code'):
                user_data["zp"] = [hashlib.sha256(address['postal_code'].strip().encode()).hexdigest()]
            
            # Country
            if address.get('country'):
                # Map common country names to 2-letter codes
                country = address['country'].lower()
                country_map = {
                    'czechia': 'cz', 'czech republic': 'cz',
                    'united states': 'us', 'usa': 'us', 'united states of america': 'us',
                    'united kingdom': 'gb', 'uk': 'gb', 'great britain': 'gb',
                    'germany': 'de', 'france': 'fr', 'spain': 'es', 'italy': 'it'
                }
                country_code = country_map.get(country, address['country'][:2].lower())
                user_data["country"] = [hashlib.sha256(country_code.encode()).hexdigest()]
    
    logging.info(f"Meta user data fields: {', '.join(user_data.keys())}")
    return user_data


def send_meta_event(event_name, event_id, user_data, custom_data):
    """Send event to Meta Conversions API"""
    META_PIXEL_ID = os.environ.get('META_PIXEL_ID')
    META_ACCESS_TOKEN = os.environ.get('META_ACCESS_TOKEN')
    
    payload = {
        "data": [{
            "event_name": event_name,
            "event_time": int(time.time()),
            "event_id": event_id,
            "event_source_url": "https://captainenglish.com",
            "action_source": "website",
            "user_data": user_data,
            "custom_data": custom_data
        }]
    }
    
    headers = {'Content-Type': 'application/json'}
    url = f"https://graph.facebook.com/v18.0/{META_PIXEL_ID}/events?access_token={META_ACCESS_TOKEN}"
    
    try:
        response = requests.post(url, data=json.dumps(payload), headers=headers, timeout=10)
        response.raise_for_status()
        logging.info(f"Successfully sent '{event_name}' to Meta. Event ID: {event_id}")
        
        # Log response for debugging
        result = response.json()
        if 'events_received' in result:
            logging.info(f"Meta confirmed events received: {result['events_received']}")
        
        return True
    except requests.exceptions.Timeout:
        logging.error(f"Timeout sending '{event_name}' to Meta")
        return False
    except requests.exceptions.RequestException as e:
        logging.error(f"Failed to send '{event_name}' to Meta: {e}")
        if hasattr(e, 'response') and e.response is not None:
            logging.error(f"Meta API response: {e.response.text}")
        return False