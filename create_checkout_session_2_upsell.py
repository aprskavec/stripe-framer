import os
import stripe
import logging
import functions_framework
from flask import request, jsonify

logging.basicConfig(level=logging.INFO)

@functions_framework.http
def create_checkout_session(request):
    stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")

    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
        return ('', 204, headers)

    headers = {'Access-Control-Allow-Origin': '*'}

    if request.method != 'POST':
        return (jsonify({'error': 'Method not allowed'}), 405, headers)

    try:
        data = request.get_json(silent=True) or {}
        email = data.get("email")
        customer_id = data.get("customer_id")  # Accept customer_id from frontend
        session_id = data.get("session_id")     # Accept session_id from frontend
        funnel_type = data.get("funnel_type", "upsell")
        locale = data.get("current_locale", "")
        locale_prefix = f"/{locale}" if locale else ""
        
        # NEW: Get Meta tracking metadata
        metadata = data.get("metadata", {})
        
        # NEW: Get client IP address for Meta tracking
        client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        if client_ip and ',' in client_ip:
            client_ip = client_ip.split(',')[0].strip()
        
        SUCCESS_REDIRECT_URL = f"https://captainenglish.com{locale_prefix}/thank-you-lifetime?session_id={{CHECKOUT_SESSION_ID}}"

        # Initialize variables
        final_customer_id = None
        prefill_email = email
        
        # Try to retrieve customer info from previous session
        if session_id:
            try:
                # Retrieve the previous checkout session
                previous_session = stripe.checkout.Session.retrieve(session_id)
                
                # Get customer ID from previous session
                if previous_session.customer:
                    final_customer_id = previous_session.customer
                    logging.info(f"Retrieved customer {final_customer_id} from previous session")
                    
                    # Get full customer details
                    customer = stripe.Customer.retrieve(final_customer_id)
                    prefill_email = customer.email
                    
                # If no customer but has customer_details
                elif previous_session.customer_details:
                    prefill_email = previous_session.customer_details.email
                    logging.info(f"Retrieved email {prefill_email} from session customer_details")
                    
            except Exception as e:
                logging.warning(f"Could not retrieve previous session: {e}")
        
        # If we still don't have a customer_id, try the one passed directly
        if not final_customer_id and customer_id:
            try:
                # Verify this customer exists
                customer = stripe.Customer.retrieve(customer_id)
                final_customer_id = customer_id
                prefill_email = customer.email
                logging.info(f"Using customer_id passed from frontend: {final_customer_id}")
            except Exception as e:
                logging.warning(f"Could not retrieve customer {customer_id}: {e}")
        
        # If we still don't have a customer, try to find by email
        if not final_customer_id and prefill_email:
            try:
                customers = stripe.Customer.list(email=prefill_email, limit=1)
                if customers.data:
                    final_customer_id = customers.data[0].id
                    logging.info(f"Found existing customer by email: {final_customer_id}")
                else:
                    # Create new customer
                    customer = stripe.Customer.create(
                        email=prefill_email,
                        metadata={
                            'source': 'upsell_checkout',
                            'funnel': funnel_type,
                            'fbclid': metadata.get('fbclid', ''),  # Store fbclid
                            'locale': locale
                        }
                    )
                    final_customer_id = customer.id
                    logging.info(f"Created new customer for upsell: {final_customer_id}")
            except Exception as e:
                logging.warning(f"Customer lookup/creation failed: {e}")

        # NEW: Log Meta tracking data
        logging.info(f"Upsell Meta tracking - fbc: {metadata.get('fbc', 'none')}, fbp: {metadata.get('fbp', 'none')}, client_ip: {client_ip}")

        # Build session data
        session_data = {
            "line_items": [{"price": "price_1RihzWLm9s3Kr237zZAbjOio", "quantity": 1}],
            "mode": "payment",
            "ui_mode": "embedded",
            "return_url": SUCCESS_REDIRECT_URL,
            # NEW: Enhanced metadata for Meta tracking
            "metadata": {
                "funnel_type": funnel_type, 
                "locale": locale,
                "is_upsell": "true",
                "previous_session_id": session_id or "",
                "fbc": metadata.get('fbc', ''),  # Facebook Click ID
                "fbp": metadata.get('fbp', ''),  # Facebook Browser ID
                "client_ip": client_ip,  # IP Address for Meta
                "original_session_id": metadata.get('original_session_id', ''),
                "source": 'upsell_checkout'
            },
            # SIMPLIFIED: Only collect billing country, not full address
            "billing_address_collection": "auto",  # This only collects country
            # REMOVED: No phone collection
        }

        # Set customer or email for the session
        if final_customer_id:
            session_data["customer"] = final_customer_id
            # Note: payment_method_collection is not needed for embedded checkout
            # Stripe will automatically show saved payment methods for the customer
            logging.info(f"Creating upsell session with customer {final_customer_id}")
        elif prefill_email:
            session_data["customer_email"] = prefill_email
            logging.info(f"Creating upsell session with email {prefill_email}")
        else:
            logging.warning("Creating upsell session without customer info")

        # Create the session
        session = stripe.checkout.Session.create(**session_data)
        logging.info(f"Upsell session created: {session.id}")
        logging.info(f"Upsell session metadata: {session.metadata}")
        
        response_data = {
            'clientSecret': session.client_secret,
            'has_customer': bool(final_customer_id),
            'customer_email': prefill_email
        }
        
        return (jsonify(response_data), 200, headers)

    except Exception as e:
        logging.exception("Error in create_checkout_session")
        return (jsonify({'error': str(e)}), 500, headers)