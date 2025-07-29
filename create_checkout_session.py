import os
import stripe
import logging
import functions_framework
from flask import request, jsonify, make_response
import time
import hashlib
import requests

# Configure logging
logging.basicConfig(level=logging.INFO)

# Helper function to send Lead event to Meta
def send_lead_to_meta(email, metadata):
    """Send Lead event to Meta Conversions API"""
    META_PIXEL_ID = os.environ.get('META_PIXEL_ID')
    META_ACCESS_TOKEN = os.environ.get('META_ACCESS_TOKEN')
    
    # Only proceed if Meta is configured
    if not META_PIXEL_ID or not META_ACCESS_TOKEN:
        logging.info("Meta not configured, skipping Lead event")
        return
    
    # Build user data
    user_data = {
        "em": [hashlib.sha256(email.lower().strip().encode()).hexdigest()]
    }
    
    # Add fbclid if available
    if metadata.get('fbclid'):
        # Convert fbclid to fbc format
        fbc = f"fb.1.{int(time.time() * 1000)}.{metadata['fbclid']}"
        user_data["fbc"] = fbc
        logging.info(f"Adding fbc to Lead event: {fbc}")
    
    # Add client IP if available
    if metadata.get('client_ip'):
        user_data["client_ip_address"] = metadata['client_ip']
    
    # Add user agent if available
    if metadata.get('user_agent'):
        user_data["client_user_agent"] = metadata['user_agent']
    
    # Build payload
    payload = {
        "data": [{
            "event_name": "Lead",
            "event_time": int(time.time()),
            "event_id": f"lead_{email}_{int(time.time())}",
            "event_source_url": "https://captainenglish.com",
            "action_source": "website",
            "user_data": user_data,
            "custom_data": {
                "content_name": "Email Signup",
                "content_category": "Lead Generation",
                "value": 0.0,
                "currency": "USD",
                "lead_source": metadata.get('source', 'email_capture_step'),
                "locale": metadata.get('locale', '')
            }
        }]
    }
    
    # Send to Meta
    try:
        url = f"https://graph.facebook.com/v18.0/{META_PIXEL_ID}/events?access_token={META_ACCESS_TOKEN}"
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        logging.info(f"Successfully sent Lead event to Meta for {email}")
        result = response.json()
        if 'events_received' in result:
            logging.info(f"Meta confirmed events received: {result['events_received']}")
    except Exception as e:
        logging.error(f"Failed to send Lead to Meta: {e}")
        if hasattr(e, 'response') and e.response is not None:
            logging.error(f"Meta API response: {e.response.text}")

# --- Function to create Checkout Session ---
# SIMPLIFIED VERSION - Only collects email, name, card, and country
@functions_framework.http
def create_checkout_session(request):
    # Set up Stripe API key
    stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")

    # Handle CORS preflight requests
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
        return ('', 204, headers)

    # Set base headers for all responses
    response_headers = {'Access-Control-Allow-Origin': '*'}

    if request.method != 'POST':
        return (jsonify({'error': 'Method not allowed'}), 405, response_headers)

    try:
        data = request.get_json(silent=True) or {}
        email = data.get("email")
        # TODO: Return error if email is not provided
        action = data.get("action", "checkout")
        funnel_type = data.get("funnel_type", "option_b")
        
        # Get locale from request data
        locale = data.get("current_locale", "")
        locale_prefix = f"/{locale}" if locale else ""
        
        # NEW: Get Meta tracking metadata
        metadata = data.get("metadata", {})
        
        # NEW: Get client IP address for Meta tracking
        client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        if client_ip and ',' in client_ip:
            client_ip = client_ip.split(',')[0].strip()
        
        # Add client IP to metadata
        metadata['client_ip'] = client_ip
        metadata['locale'] = locale
        
        # IMPORTANT: Updated success URL to pass customer info to upsell page
        SUCCESS_REDIRECT_URL = f"https://captainenglish.com{locale_prefix}/captain-forever?session_id={{CHECKOUT_SESSION_ID}}&customer_id={{CHECKOUT_SESSION_CUSTOMER}}&customer_email={{CHECKOUT_SESSION_CUSTOMER_EMAIL}}"

        # Action: Create a lead in Stripe for Option B's first step
        if action == "create_lead":
            if not email:
                return (jsonify({'error': 'Email is required for lead creation'}), 400, response_headers)
            
            logging.info(f"Action: create_lead for email: {email}")
            logging.info(f"Lead metadata: fbclid={metadata.get('fbclid')}, user_agent={metadata.get('user_agent', '')[:50]}")
            
            try:
                # Check if customer already exists
                existing_customers = stripe.Customer.list(email=email, limit=1)
                if existing_customers.data:
                    customer = existing_customers.data[0]
                    logging.info(f"Found existing customer: {customer.id}")
                    
                    # NEW: Update customer metadata with Facebook data if available
                    if metadata.get('fbclid'):
                        updated_metadata = customer.metadata or {}
                        updated_metadata['fbclid'] = metadata['fbclid']
                        updated_metadata['last_seen_locale'] = locale
                        
                        stripe.Customer.modify(
                            customer.id,
                            metadata=updated_metadata
                        )
                else:
                    customer = stripe.Customer.create(
                        email=email,
                        metadata={
                            'source': metadata.get('source', 'lead_capture_step_1'),
                            'funnel': 'option_b',
                            'fbclid': metadata.get('fbclid', ''),  # NEW: Store Facebook Click ID
                            'locale': locale
                        }
                    )
                    logging.info(f"New lead created: {customer.id}")
                    
                    # Send Lead event to Meta for new leads
                    send_lead_to_meta(email, metadata)
                
                return (jsonify({'status': 'lead_created', 'customer_id': customer.id}), 200, response_headers)
            except Exception as e:
                logging.error(f"Lead creation failed: {e}")
                return (jsonify({'status': 'lead_creation_failed', 'error': str(e)}), 500, response_headers)

        # Action: Create a checkout session
        logging.info(f"Action: create_checkout_session for email: {email}, funnel: {funnel_type}, locale: {locale}")
        
        # NEW: Log Meta tracking data
        logging.info(f"Meta tracking - fbc: {metadata.get('fbc', 'none')}, fbp: {metadata.get('fbp', 'none')}, client_ip: {client_ip}")

        # Store customer_id for later use
        customer_id = None

        session_data = {
            "line_items": [{"price": "price_1RihNELm9s3Kr237MPqAlg9l", "quantity": 1}],
            "allow_promotion_codes": False,
            "mode": "subscription",
            "subscription_data": {"trial_period_days": 3},
            "ui_mode": "embedded",
            "return_url": SUCCESS_REDIRECT_URL,
            # NEW: Enhanced metadata for Meta tracking
            "metadata": {
                "funnel_type": funnel_type,
                "locale": locale,
                "email": email,
                "fbc": metadata.get('fbc', ''),  # Facebook Click ID
                "fbp": metadata.get('fbp', ''),  # Facebook Browser ID
                "client_ip": client_ip,  # IP Address for Meta
                "source": 'web_checkout'
            },
            # SIMPLIFIED: Only collect billing country, not full address
            "billing_address_collection": "auto",  # This only collects country
            # REMOVED: No phone collection
            # "phone_number_collection": {"enabled": False}  # This is already false by default
        }

        # If an email is provided, pre-fill it in checkout
        if email:
            try:
                customers = stripe.Customer.list(email=email, limit=1)
                if customers.data:
                    customer_id = customers.data[0].id
                    session_data["customer"] = customer_id
                    logging.info(f"Using existing customer: {customer_id}")
                else:
                    # Create a new customer with the email
                    new_customer = stripe.Customer.create(
                        email=email,
                        metadata={
                            'source': 'checkout_prefill',
                            'funnel': funnel_type,
                            'fbclid': metadata.get('fbclid', ''),  # Store fbclid on customer
                            'locale': locale
                        }
                    )
                    customer_id = new_customer.id
                    session_data["customer"] = new_customer.id
                    logging.info(f"Created new customer for checkout: {new_customer.id}")
            except Exception as e:
                logging.warning(f"Could not create/find customer, passing email directly: {e}")
                session_data["customer_email"] = email
        
        # Create the checkout session
        session = stripe.checkout.Session.create(**session_data)
        logging.info(f"Checkout session created: {session.id}")
        logging.info(f"Session metadata: {session.metadata}")
        
        # Return both clientSecret and customer_id for tracking
        response_data = {
            'clientSecret': session.client_secret
        }
        
        # Add customer_id if we have it (for frontend tracking if needed)
        if customer_id:
            response_data['customer_id'] = customer_id
        
        return (jsonify(response_data), 200, response_headers)

    except Exception as e:
        logging.exception("FATAL ERROR in create_checkout_session")
        return (jsonify({'error': f'An unexpected error occurred: {str(e)}'}), 500, response_headers)
