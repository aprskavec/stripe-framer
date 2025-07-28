import React, { useState, useEffect, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"

// Configuration
const API_ENDPOINT = "https://ce-stripe-form-3iw4kbqopa-uc.a.run.app"
const STRIPE_PUBLISHABLE_KEY =
    "pk_test_51QlZWPLm9s3Kr237FlXgRpa0m71AOgD9Q41II3cSnBGVzcXrfD3CkUOWEmJCoYOcBeJrOTTlR0gMksPCu10dxP7q00FcHQZJa5"

// Helper functions
const getFacebookClickId = () => {
    if (typeof window === "undefined") return null
    const urlParams = new URLSearchParams(window.location.search)
    const fbclid = urlParams.get("fbclid")
    if (fbclid) {
        const fbc = `fb.1.${Date.now()}.${fbclid}`
        document.cookie = `_fbc=${fbc}; max-age=604800; path=/; domain=.captainenglish.com`
        return fbclid
    }
    const fbcCookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith("_fbc="))
    if (fbcCookie) {
        const parts = fbcCookie.split("=")[1].split(".")
        if (parts.length >= 4) return parts.slice(3).join(".")
    }
    return null
}

const getFacebookData = () => {
    if (typeof window === "undefined") return { fbc: null, fbp: null }
    const urlParams = new URLSearchParams(window.location.search)
    const fbclid = urlParams.get("fbclid")
    let fbc = null
    let fbp = null
    if (fbclid) {
        fbc = `fb.1.${Date.now()}.${fbclid}`
        document.cookie = `_fbc=${fbc}; max-age=604800; path=/; domain=.captainenglish.com`
    } else {
        const fbcCookie = document.cookie
            .split("; ")
            .find((row) => row.startsWith("_fbc="))
        if (fbcCookie) fbc = fbcCookie.split("=")[1]
    }
    const fbpCookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith("_fbp="))
    if (fbpCookie) fbp = fbpCookie.split("=")[1]
    return { fbc, fbp }
}

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

// Stripe loading
let stripePromise = null
const loadStripe = () => {
    if (!stripePromise && typeof window !== "undefined") {
        stripePromise = new Promise((resolve, reject) => {
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
                } else {
                    reject(new Error("Stripe.js not loaded"))
                }
            }
            script.onerror = () => reject(new Error("Failed to load Stripe.js"))
            document.head.appendChild(script)
        })
    }
    return stripePromise
}

// Email Capture Component
function EmailCaptureStep({
    placeholder,
    buttonText,
    loadingText,
    invalidEmailError,
    errorMessage,
    onEmailCapture,
}) {
    const [email, setEmail] = useState("")
    const [isLoading, setLoading] = useState(false)
    const [error, setError] = useState("")

    const handleSubmit = async () => {
        setError("")
        if (!email.includes("@")) {
            setError(invalidEmailError || "Please enter a valid email address.")
            return
        }
        setLoading(true)
        try {
            // Create lead in backend
            const response = await fetch(API_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "create_lead",
                    email: email.trim(),
                    current_locale: getCurrentLocale(),
                    metadata: {
                        fbclid: getFacebookClickId() || "",
                        source: "combined_email_checkout",
                        user_agent: navigator.userAgent || "",
                    },
                }),
            })

            if (!response.ok)
                throw new Error(`Server error: ${response.status}`)

            const result = await response.json()

            if (
                result.status === "lead_created" ||
                result.status === "lead_already_exists"
            ) {
                // Track analytics
                if (window.dataLayer) {
                    window.dataLayer.push({
                        event: "email_captured",
                        user_data: { email: email.trim() },
                        capture_details: {
                            source: "combined_flow",
                            funnel_type: "option_a",
                        },
                    })
                }
                onEmailCapture(email.trim())
            } else {
                throw new Error(result.error || "Unexpected response")
            }
        } catch (err) {
            console.error("Error:", err)
            setError(errorMessage || "Something went wrong. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ width: "100%" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                        setEmail(e.target.value)
                        setError("")
                    }}
                    onKeyPress={(e) => {
                        if (e.key === "Enter" && !isLoading) handleSubmit()
                    }}
                    placeholder={placeholder || "Enter your email address"}
                    style={{
                        width: "100%",
                        padding: "15px",
                        borderRadius: 5,
                        border: error ? "2px solid #dc2626" : "2px solid #ddd",
                        fontSize: 16,
                        boxSizing: "border-box",
                        outline: "none",
                    }}
                    disabled={isLoading}
                />
                <button
                    onClick={handleSubmit}
                    disabled={isLoading || !email}
                    style={{
                        background: isLoading ? "#cccccc" : "#007cba",
                        color: "white",
                        padding: "15px 30px",
                        borderRadius: 5,
                        border: "none",
                        fontSize: 16,
                        fontWeight: "bold",
                        cursor: isLoading || !email ? "not-allowed" : "pointer",
                        width: "100%",
                        boxSizing: "border-box",
                        opacity: isLoading || !email ? 0.7 : 1,
                    }}
                >
                    {isLoading
                        ? loadingText || "Processing..."
                        : buttonText || "Continue to checkout"}
                </button>
            </div>
            {error && (
                <div
                    style={{
                        color: "#dc2626",
                        fontSize: 14,
                        marginTop: 10,
                        textAlign: "center",
                    }}
                >
                    {error}
                </div>
            )}
        </div>
    )
}

// Integrated Stripe Checkout Component
function IntegratedStripeCheckout({ email }) {
    const [clientSecret, setClientSecret] = useState(null)
    const [errorMessage, setErrorMessage] = useState(null)
    const checkoutRef = useRef(null)
    const containerRef = useRef(null)

    useEffect(() => {
        if (!email) return

        const abortController = new AbortController()
        const { fbc, fbp } = getFacebookData()

        // Create checkout session
        fetch(API_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: email,
                funnel_type: "option_a",
                current_locale: getCurrentLocale(),
                combined_flow: true,
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
                if (!res.ok)
                    throw new Error(
                        `Network response was not ok: ${res.status}`
                    )
                return res.json()
            })
            .then((data) => {
                if (data.clientSecret) {
                    setClientSecret(data.clientSecret)
                } else {
                    throw new Error("Client secret not found in response")
                }
            })
            .catch((error) => {
                if (error.name !== "AbortError") {
                    setErrorMessage("Could not load payment form.")
                    console.error("Error:", error)
                }
            })

        return () => abortController.abort()
    }, [email])

    useEffect(() => {
        if (!clientSecret || typeof window === "undefined") return

        loadStripe()
            .then((stripe) => {
                if (!stripe) throw new Error("Stripe not initialized")

                return stripe.initEmbeddedCheckout({
                    clientSecret,
                    onComplete: () => {
                        console.log("Payment completed")
                    },
                })
            })
            .then((checkout) => {
                checkoutRef.current = checkout
                checkout.mount("#stripe-checkout-container")
            })
            .catch((error) => {
                console.error("Stripe error:", error)
                setErrorMessage("Failed to initialize payment form.")
            })

        return () => {
            if (checkoutRef.current) {
                checkoutRef.current.destroy()
            }
        }
    }, [clientSecret])

    if (errorMessage) {
        return (
            <div style={{ color: "#dc2626", textAlign: "center", padding: 20 }}>
                {errorMessage}
            </div>
        )
    }

    return (
        <div
            ref={containerRef}
            id="stripe-checkout-container"
            style={{ width: "100%", minHeight: 600 }}
        >
            {!clientSecret && (
                <div
                    style={{ textAlign: "center", padding: 40, color: "#666" }}
                >
                    Loading secure payment form...
                </div>
            )}
        </div>
    )
}

// Main Combined Component
export default function EmailAndCheckout(props) {
    const [email, setEmail] = useState("")
    const [showCheckout, setShowCheckout] = useState(false)

    const handleEmailSubmit = (capturedEmail) => {
        setEmail(capturedEmail)
        setShowCheckout(true)

        // Track checkout begin
        if (window.dataLayer) {
            window.dataLayer.push({
                event: "begin_checkout",
                ecommerce: {
                    currency: "USD",
                    value: 5.0,
                    items: [
                        {
                            item_id: "captain_english_pro",
                            item_name: "Captain English Pro - 3 Day Trial",
                            price: 5.0,
                            quantity: 1,
                            item_category: "subscription",
                        },
                    ],
                },
                checkout_details: {
                    funnel_type: "option_a",
                    locale: getCurrentLocale(),
                    combined_flow: true,
                },
            })
        }
    }

    return (
        <div style={{ width: "100%" }}>
            {!showCheckout ? (
                <EmailCaptureStep
                    placeholder={props.emailPlaceholder}
                    buttonText={props.emailButtonText}
                    loadingText={props.emailLoadingText}
                    invalidEmailError={props.emailErrorText}
                    errorMessage={props.generalErrorText}
                    onEmailCapture={handleEmailSubmit}
                />
            ) : (
                <div style={{ width: "100%" }}>
                    {props.showEmailHeader && (
                        <div
                            style={{
                                marginBottom: 20,
                                textAlign: "center",
                                color: "#666",
                                fontSize: 14,
                            }}
                        >
                            Secure checkout for: <strong>{email}</strong>
                        </div>
                    )}
                    <IntegratedStripeCheckout email={email} />
                </div>
            )}
        </div>
    )
}

// Add Framer property controls
addPropertyControls(EmailAndCheckout, {
    emailPlaceholder: {
        type: ControlType.String,
        title: "Email Placeholder",
        defaultValue: "Enter your email address",
    },
    emailButtonText: {
        type: ControlType.String,
        title: "Email Button",
        defaultValue: "Continue to checkout",
    },
    emailLoadingText: {
        type: ControlType.String,
        title: "Loading Text",
        defaultValue: "Processing...",
    },
    emailErrorText: {
        type: ControlType.String,
        title: "Invalid Email",
        defaultValue: "Please enter a valid email address.",
    },
    generalErrorText: {
        type: ControlType.String,
        title: "Error Message",
        defaultValue: "Something went wrong. Please try again.",
    },
    showEmailHeader: {
        type: ControlType.Boolean,
        title: "Show Email Header",
        defaultValue: true,
    },
})
