import React, { useState, useEffect, useRef } from "react"

// --- Configuration ---
const STRIPE_PUBLISHABLE_KEY =
    "pk_test_51QlZWPLm9s3Kr237FlXgRpa0m71AOgD9Q41II3cSnBGVzcXrfD3CkUOWEmJCoYOcBeJrOTTlR0gMksPCu10dxP7q00FcHQZJa5"
const BACKEND_URL = "https://ce-stripe-form-3iw4kbqopa-uc.a.run.app"

// PERFORMANCE: Preload Stripe.js
if (typeof window !== "undefined") {
    const link = document.createElement("link")
    link.rel = "preload"
    link.as = "script"
    link.href = "https://js.stripe.com/v3/"
    document.head.appendChild(link)
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

// Helper function to get current locale from URL
const getCurrentLocale = () => {
    if (typeof window === "undefined") {
        return ""
    }

    const path = window.location.pathname
    const segments = path.split("/").filter(Boolean)

    const locales = ["es", "ar", "hi", "fr", "de", "ja"]
    if (segments.length > 0 && locales.includes(segments[0])) {
        return segments[0]
    }
    return ""
}

// Helper function to build locale-aware URLs
const buildLocaleUrl = (path) => {
    if (typeof window === "undefined") {
        return path
    }

    const locale = getCurrentLocale()
    const baseUrl = window.location.origin

    if (locale) {
        return `${baseUrl}/${locale}${path}`
    }
    return `${baseUrl}${path}`
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
                    if (window.Sentry?.addBreadcrumb) {
                        window.Sentry.addBreadcrumb({
                            category: "stripe",
                            message: "Stripe.js loaded successfully",
                            level: "info",
                        })
                    }
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

/**
 * A Framer component to embed Stripe Checkout with Sentry error tracking.
 */
export default function StripeCheckout(props) {
    const { email = "", isEnabled = true } = props

    // Initialize state
    const [effectiveEmail, setEffectiveEmail] = useState(email)
    const [clientSecret, setClientSecret] = useState(null)
    const [errorMessage, setErrorMessage] = useState(null)
    const [hasMounted, setHasMounted] = useState(false)
    const [checkoutStartTracked, setCheckoutStartTracked] = useState(false)
    const [storedCustomerId, setStoredCustomerId] = useState(null)
    const checkoutRef = useRef(null)
    const containerRef = useRef(null)

    useEffect(() => {
        setHasMounted(true)

        // Read email from URL if not provided as prop
        if (typeof window !== "undefined") {
            const urlParams = new URLSearchParams(window.location.search)
            const emailFromUrl = urlParams.get("email")
            setEffectiveEmail(email || emailFromUrl || "")

            // Set user context in Sentry if email is available
            const finalEmail = email || emailFromUrl
            if (finalEmail && window.Sentry?.setUser) {
                window.Sentry.setUser({ email: finalEmail })
            }
        }
    }, [email])

    // PERFORMANCE: Optimized intersection observer
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
                        const trackEvent = () => {
                            if (window.dataLayer) {
                                const currentPath = window.location.pathname
                                const funnelType = currentPath.includes(
                                    "/personal-plan/"
                                )
                                    ? "option_b"
                                    : "option_a"

                                const checkoutData = {
                                    event: "begin_checkout",
                                    ecommerce: {
                                        currency: "USD",
                                        value: 5.0,
                                        items: [
                                            {
                                                item_id: "captain_english_pro",
                                                item_name:
                                                    "Captain English Pro - 3 Day Trial",
                                                price: 5.0,
                                                quantity: 1,
                                                item_category: "subscription",
                                            },
                                        ],
                                    },
                                    checkout_details: {
                                        funnel_type: funnelType,
                                        locale: getCurrentLocale(),
                                        has_email: !!effectiveEmail,
                                        page_path: window.location.pathname,
                                    },
                                }

                                window.dataLayer.push(checkoutData)

                                // Log to Sentry
                                window.Sentry?.addBreadcrumb?.({
                                    category: "analytics",
                                    message: "begin_checkout event tracked",
                                    level: "info",
                                    data: checkoutData.checkout_details,
                                })

                                setCheckoutStartTracked(true)
                                observer.disconnect()
                            }
                        }

                        // Use requestIdleCallback if available, otherwise setTimeout
                        if (window.requestIdleCallback) {
                            window.requestIdleCallback(trackEvent)
                        } else {
                            setTimeout(trackEvent, 0)
                        }
                    }
                })
            },
            {
                threshold: 0.5,
                rootMargin: "50px",
            }
        )

        observer.observe(containerRef.current)

        return () => {
            observer.disconnect()
        }
    }, [clientSecret, checkoutStartTracked, effectiveEmail])

    useEffect(() => {
        if (!isEnabled || !hasMounted || typeof window === "undefined") return

        const abortController = new AbortController()

        const currentPath = window.location.pathname
        const funnelType = currentPath.includes("/personal-plan/")
            ? "option_b"
            : "option_a"

        // Get Facebook tracking data
        const { fbc, fbp } = getFacebookData()

        // Set context to Sentry
        window.Sentry?.setContext?.("checkout", {
            funnel_type: funnelType,
            locale: getCurrentLocale(),
            has_email: !!effectiveEmail,
            has_fbc: !!fbc,
            has_fbp: !!fbp,
        })

        // PERFORMANCE: Optimized fetch with timeout
        const timeoutId = setTimeout(() => abortController.abort(), 10000)

        fetch(BACKEND_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: effectiveEmail || null,
                funnel_type: funnelType,
                current_locale: getCurrentLocale(),
                metadata: {
                    fbc: fbc || "",
                    fbp: fbp || "",
                    client_ip: "will_be_set_server_side",
                    user_agent: navigator.userAgent || "",
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

                    if (data.customer_id) {
                        setStoredCustomerId(data.customer_id)
                        window.Sentry?.setUser?.({
                            email: effectiveEmail,
                            id: data.customer_id,
                        })
                    }
                } else {
                    throw new Error("Client secret not found in response")
                }
            })
            .catch((error) => {
                clearTimeout(timeoutId)
                if (error.name !== "AbortError") {
                    setErrorMessage("Could not load payment form.")
                    window.Sentry?.captureException?.(error, {
                        tags: {
                            component: "StripeCheckout",
                            action: "fetch_client_secret",
                        },
                        extra: {
                            email: effectiveEmail,
                            funnel_type: funnelType,
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
    }, [effectiveEmail, isEnabled, hasMounted])

    useEffect(() => {
        if (!clientSecret || typeof window === "undefined") return

        loadStripe()
            .then((stripe) => {
                if (!stripe) {
                    throw new Error("Stripe not initialized")
                }

                return stripe.initEmbeddedCheckout({
                    clientSecret,
                    onComplete: () => {
                        window.Sentry?.addBreadcrumb?.({
                            category: "stripe",
                            message: "Payment completed successfully",
                            level: "info",
                            data: {
                                customer_id: storedCustomerId,
                            },
                        })
                    },
                })
            })
            .then((checkout) => {
                checkoutRef.current = checkout
                checkout.mount("#stripe-checkout-container")

                window.Sentry?.addBreadcrumb?.({
                    category: "stripe",
                    message: "Checkout mounted successfully",
                    level: "info",
                })
            })
            .catch((error) => {
                window.Sentry?.captureException?.(error, {
                    tags: {
                        component: "StripeCheckout",
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
    }, [clientSecret, storedCustomerId])

    if (!hasMounted) {
        return null
    }

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
                <div style={loadingStyle}>Loading Secure Payment Form...</div>
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
