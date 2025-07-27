import React, { useState, useEffect, useRef } from "react"

// --- Configuration ---
const STRIPE_PUBLISHABLE_KEY =
    "pk_test_51QlZWPLm9s3Kr237FlXgRpa0m71AOgD9Q41II3cSnBGVzcXrfD3CkUOWEmJCoYOcBeJrOTTlR0gMksPCu10dxP7q00FcHQZJa5"
const BACKEND_URL = "https://ce-stripe-upsell-form-3iw4kbqopa-uc.a.run.app"

// PERFORMANCE: Preload Stripe.js
if (typeof window !== "undefined") {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'script';
    link.href = 'https://js.stripe.com/v3/';
    document.head.appendChild(link);
}

// --- Helpers ---
const getCurrentLocale = () => {
    if (typeof window === "undefined") return ""
    const path = window.location.pathname
    const segments = path.split("/").filter(Boolean)
    const locales = [
        "es",
        "ar",
        "hi",
        "fr",
        "de",
        "it",
        "pt",
        "ru",
        "ja",
        "ko",
        "zh",
    ]
    return segments.length > 0 && locales.includes(segments[0])
        ? segments[0]
        : ""
}

// Helper function to get Facebook Click ID and Browser ID
const getFacebookData = () => {
    if (typeof window === "undefined") {
        return { fbc: null, fbp: null }
    }

    // Get fbclid from URL
    const urlParams = new URLSearchParams(window.location.search)
    const fbclid = urlParams.get("fbclid")

    let fbc = null
    let fbp = null

    // If we have fbclid in URL, create/update the fbc cookie
    if (fbclid) {
        fbc = `fb.1.${Date.now()}.${fbclid}`
        // Store in cookie for 7 days
        document.cookie = `_fbc=${fbc}; max-age=604800; path=/; domain=.captainenglish.com`
    } else {
        // Try to get from existing cookie
        const fbcCookie = document.cookie
            .split("; ")
            .find((row) => row.startsWith("_fbc="))
        if (fbcCookie) {
            fbc = fbcCookie.split("=")[1]
        }
    }

    // Get Facebook Browser ID from cookie
    const fbpCookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith("_fbp="))
    if (fbpCookie) {
        fbp = fbpCookie.split("=")[1]
    }

    return { fbc, fbp }
}

const buildLocaleUrl = (path) => {
    if (typeof window === "undefined") return path
    const locale = getCurrentLocale()
    const baseUrl = window.location.origin
    return locale ? `${baseUrl}/${locale}${path}` : `${baseUrl}${path}`
}

// PERFORMANCE: Optimized Stripe loading with caching
let stripePromise = null
const loadStripe = () => {
    if (!stripePromise && typeof window !== "undefined") {
        stripePromise = new Promise((resolve, reject) => {
            // Check if Stripe is already loaded
            if (window.Stripe) {
                resolve(window.Stripe(STRIPE_PUBLISHABLE_KEY))
                return
            }

            const script = document.createElement("script")
            script.src = "https://js.stripe.com/v3/"
            script.async = true
            script.onload = () => {
                if (window.Stripe) {
                    resolve(window.Stripe(STRIPE_PUBLISHABLE_KEY))
                    // Log to Sentry if available
                    window.Sentry?.addBreadcrumb?.({
                        category: "stripe",
                        message: "Stripe.js loaded successfully for upsell",
                        level: "info",
                    })
                } else {
                    const error = new Error("Stripe.js not loaded")
                    window.Sentry?.captureException?.(error)
                    reject(error)
                }
            }
            script.onerror = () => {
                const error = new Error("Failed to load Stripe.js script")
                window.Sentry?.captureException?.(error)
                reject(error)
            }
            document.head.appendChild(script)
        })
    }
    return stripePromise
}

// --- Main Component ---
export default function UpsellStripeCheckout({ email = "", isEnabled = true }) {
    const [effectiveEmail, setEffectiveEmail] = useState(email)
    const [sessionId, setSessionId] = useState(null)
    const [customerId, setCustomerId] = useState(null)
    const [clientSecret, setClientSecret] = useState(null)
    const [errorMessage, setErrorMessage] = useState(null)
    const [hasMounted, setHasMounted] = useState(false)
    const [checkoutStartTracked, setCheckoutStartTracked] = useState(false)
    const checkoutRef = useRef(null)
    const containerRef = useRef(null)

    useEffect(() => {
        setHasMounted(true)
        if (typeof window !== "undefined") {
            const urlParams = new URLSearchParams(window.location.search)

            // Get all relevant parameters from URL
            const emailFromUrl =
                urlParams.get("email") || urlParams.get("customer_email")
            const sessionFromUrl = urlParams.get("session_id")
            const customerFromUrl = urlParams.get("customer_id")

            setEffectiveEmail(email || emailFromUrl || "")
            setSessionId(sessionFromUrl)
            setCustomerId(customerFromUrl)

            // Set user context in Sentry
            if ((emailFromUrl || customerFromUrl) && window.Sentry?.setUser) {
                window.Sentry.setUser({
                    email: emailFromUrl,
                    id: customerFromUrl,
                })
            }

            window.Sentry?.addBreadcrumb?.({
                category: "upsell",
                message: "Upsell checkout initialized",
                level: "info",
                data: {
                    has_email: !!(email || emailFromUrl),
                    has_session: !!sessionFromUrl,
                    has_customer: !!customerFromUrl,
                },
            })
        }
    }, [email])

    // PERFORMANCE: Optimized intersection observer for upsell tracking
    useEffect(() => {
        if (
            !clientSecret ||
            !containerRef.current ||
            checkoutStartTracked ||
            typeof window === "undefined"
        )
            return

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (
                        entry.isIntersecting &&
                        entry.intersectionRatio >= 0.5
                    ) {
                        // PERFORMANCE: Use requestIdleCallback for analytics
                        const trackUpsellEvent = () => {
                            if (window.dataLayer) {
                                const upsellData = {
                                    event: "view_upsell",
                                    ecommerce: {
                                        currency: "USD",
                                        value: 20.0,
                                        items: [
                                            {
                                                item_id: "captain_english_upsell",
                                                item_name:
                                                    "Captain English Upsell Package",
                                                price: 20.0,
                                                quantity: 1,
                                                item_category: "upsell",
                                            },
                                        ],
                                    },
                                    upsell_details: {
                                        has_previous_session: !!sessionId,
                                        has_customer_id: !!customerId,
                                        has_email: !!effectiveEmail,
                                        locale: getCurrentLocale(),
                                    },
                                }

                                window.dataLayer.push(upsellData)

                                // Log to Sentry
                                window.Sentry?.addBreadcrumb?.({
                                    category: "analytics",
                                    message: "view_upsell event tracked",
                                    level: "info",
                                    data: upsellData.upsell_details,
                                })

                                setCheckoutStartTracked(true)
                                observer.disconnect()
                            }
                        }

                        // Use requestIdleCallback if available, otherwise setTimeout
                        if (window.requestIdleCallback) {
                            window.requestIdleCallback(trackUpsellEvent)
                        } else {
                            setTimeout(trackUpsellEvent, 0)
                        }
                    }
                })
            },
            {
                threshold: 0.5,
                rootMargin: '50px'
            }
        )

        observer.observe(containerRef.current)
        return () => observer.disconnect()
    }, [
        clientSecret,
        checkoutStartTracked,
        sessionId,
        customerId,
        effectiveEmail,
    ])

    useEffect(() => {
        if (!isEnabled || !hasMounted || typeof window === "undefined") return

        const abortController = new AbortController()

        // Get Facebook tracking data
        const { fbc, fbp } = getFacebookData()

        // Add context to Sentry
        window.Sentry?.setContext?.("upsell_checkout", {
            has_email: !!effectiveEmail,
            has_customer_id: !!customerId,
            has_session_id: !!sessionId,
            locale: getCurrentLocale(),
            has_fbc: !!fbc,
            has_fbp: !!fbp,
        })

        window.Sentry?.addBreadcrumb?.({
            category: "upsell",
            message: "Creating upsell session",
            level: "info",
            data: {
                email: effectiveEmail,
                customer_id: customerId,
                session_id: sessionId,
                has_fbc: !!fbc,
                has_fbp: !!fbp,
            },
        })

        // PERFORMANCE: Add timeout for fetch request
        const timeoutId = setTimeout(() => abortController.abort(), 10000)

        fetch(BACKEND_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: effectiveEmail || null,
                customer_id: customerId || null,
                session_id: sessionId || null,
                funnel_type: "upsell",
                current_locale: getCurrentLocale(),
                // Add Facebook tracking metadata
                metadata: {
                    fbc: fbc || "",
                    fbp: fbp || "",
                    client_ip: "will_be_set_server_side",
                    user_agent: navigator.userAgent || "",
                    original_session_id: sessionId || "",
                },
            }),
            signal: abortController.signal,
        })
            .then((res) => {
                clearTimeout(timeoutId)
                if (!res.ok) {
                    throw new Error(
                        `Network response was not ok: ${res.status}`
                    )
                }
                return res.json()
            })
            .then((data) => {
                if (data.clientSecret) {
                    setClientSecret(data.clientSecret)

                    window.Sentry?.addBreadcrumb?.({
                        category: "stripe",
                        message: "Upsell session created successfully",
                        level: "info",
                        data: {
                            has_customer: data.has_customer,
                            customer_email: data.customer_email,
                            metadata_sent: {
                                fbc: !!fbc,
                                fbp: !!fbp,
                            },
                        },
                    })
                } else {
                    throw new Error("Client secret not found in response")
                }
            })
            .catch((error) => {
                clearTimeout(timeoutId)
                if (error.name !== "AbortError") {
                    setErrorMessage("Could not load payment form.")

                    // Capture error in Sentry with context
                    window.Sentry?.captureException?.(error, {
                        tags: {
                            component: "UpsellStripeCheckout",
                            action: "fetch_client_secret",
                        },
                        extra: {
                            email: effectiveEmail,
                            customer_id: customerId,
                            session_id: sessionId,
                            locale: getCurrentLocale(),
                            has_fbc: !!fbc,
                            has_fbp: !!fbp,
                        },
                    })
                }
            })

        return () => {
            clearTimeout(timeoutId)
            abortController.abort()
        }
    }, [effectiveEmail, sessionId, customerId, isEnabled, hasMounted])

    useEffect(() => {
        if (!clientSecret || typeof window === "undefined") return

        const successUrl = buildLocaleUrl("/thank-you-upsell")

        loadStripe()
            .then((stripe) => {
                if (!stripe) {
                    throw new Error("Stripe not initialized")
                }

                return stripe.initEmbeddedCheckout({
                    clientSecret,
                    onComplete: () => {
                        // Log successful upsell to Sentry
                        window.Sentry?.addBreadcrumb?.({
                            category: "stripe",
                            message: "Upsell payment completed successfully",
                            level: "info",
                            data: {
                                customer_id: customerId,
                                session_id: sessionId,
                            },
                        })

                        // Redirect to success page
                        window.location.href = successUrl
                    },
                })
            })
            .then((checkout) => {
                checkoutRef.current = checkout
                checkout.mount("#stripe-checkout-container")

                window.Sentry?.addBreadcrumb?.({
                    category: "stripe",
                    message: "Upsell checkout mounted successfully",
                    level: "info",
                })
            })
            .catch((error) => {
                window.Sentry?.captureException?.(error, {
                    tags: {
                        component: "UpsellStripeCheckout",
                        action: "mount_checkout",
                    },
                })
                setErrorMessage("Failed to initialize payment form.")
            })

        return () => {
            if (checkoutRef.current) {
                checkoutRef.current.destroy()
            }
        }
    }, [clientSecret, customerId, sessionId])

    if (!hasMounted) return null
    if (errorMessage) {
        return <div style={errorStyle}>{errorMessage}</div>
    }

    return (
        <div
            ref={containerRef}
            key={clientSecret}
            id="stripe-checkout-container"
            style={{ width: "100%", height: "100%" }}
        >
            {!clientSecret && (
                <div style={loadingStyle}>
                    {sessionId || customerId
                        ? "Loading your personalized offer..."
                        : "Loading Secure Payment Form..."}
                </div>
            )}
        </div>
    )
}

// --- Styles ---
const errorStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    backgroundColor: "#FFFCF5",
    color: "#dc2626",
    textAlign: "center",
    fontSize: "20px",
}

const loadingStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#666",
    fontSize: "20px",
}