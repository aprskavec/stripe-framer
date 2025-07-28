import React, { useState, useEffect, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"

// Constants
const API_ENDPOINT = "https://ce-stripe-form-3iw4kbqopa-uc.a.run.app"
const STRIPE_KEY =
    "pk_test_51QlZWPLm9s3Kr237FlXgRpa0m71AOgD9Q41II3cSnBGVzcXrfD3CkUOWEmJCoYOcBeJrOTTlR0gMksPCu10dxP7q00FcHQZJa5"
const VALID_LOCALES = [
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

// Singleton Stripe loader
let stripePromise = null
const loadStripe = () => {
    if (!stripePromise && typeof window !== "undefined") {
        stripePromise = window.Stripe
            ? Promise.resolve(window.Stripe(STRIPE_KEY))
            : new Promise((resolve, reject) => {
                  const script = document.createElement("script")
                  script.src = "https://js.stripe.com/v3/"
                  script.async = true
                  script.onload = () => resolve(window.Stripe?.(STRIPE_KEY))
                  script.onerror = reject
                  document.head.appendChild(script)
              })
    }
    return stripePromise
}

// Optimized helpers with memoization
const helpers = (() => {
    let cachedLocale = null
    let cachedFbData = null

    return {
        getFbClid: () =>
            new URLSearchParams(window.location.search).get("fbclid"),

        getFbData: () => {
            if (cachedFbData) return cachedFbData

            const fbclid = helpers.getFbClid()
            const cookies = document.cookie
            let fbc = null

            if (fbclid) {
                fbc = `fb.1.${Date.now()}.${fbclid}`
                document.cookie = `_fbc=${fbc}; max-age=604800; path=/; domain=.captainenglish.com; samesite=lax; secure`
            } else {
                fbc = cookies.match(/_fbc=([^;]+)/)?.[1] || null
            }

            cachedFbData = {
                fbc,
                fbp: cookies.match(/_fbp=([^;]+)/)?.[1] || null,
            }
            return cachedFbData
        },

        getLocale: () => {
            if (cachedLocale !== null) return cachedLocale
            const [, locale] =
                window.location.pathname.match(/^\/([a-z]{2})(?:\/|$)/) || []
            cachedLocale = VALID_LOCALES.includes(locale) ? locale : ""
            return cachedLocale
        },
    }
})()

// Email Component - Pure functional with hooks
const EmailStep = React.memo(
    ({
        onSubmit,
        placeholder,
        buttonText,
        loadingText,
        invalidEmailError,
        errorMessage,
    }) => {
        const [state, setState] = useState({
            email: "",
            loading: false,
            error: "",
        })

        const handleSubmit = async (e) => {
            e.preventDefault()
            const email = state.email.trim()

            if (!email.includes("@")) {
                setState((s) => ({ ...s, error: invalidEmailError }))
                return
            }

            setState((s) => ({ ...s, loading: true, error: "" }))

            try {
                const res = await fetch(API_ENDPOINT, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "create_lead",
                        email,
                        current_locale: helpers.getLocale(),
                        metadata: {
                            fbclid: helpers.getFbClid() || "",
                            source: "combined_email_checkout",
                            user_agent: navigator.userAgent || "",
                        },
                    }),
                })

                if (!res.ok) throw new Error(`Error: ${res.status}`)

                const data = await res.json()
                if (
                    ["lead_created", "lead_already_exists"].includes(
                        data.status
                    )
                ) {
                    window.dataLayer?.push({
                        event: "email_captured",
                        user_data: { email },
                        capture_details: {
                            source: "combined_flow",
                            funnel_type: "option_a",
                        },
                    })
                    onSubmit(email)
                } else {
                    throw new Error(data.error || "Failed")
                }
            } catch {
                setState((s) => ({ ...s, error: errorMessage, loading: false }))
            }
        }

        const { email, loading, error } = state

        return (
            <form onSubmit={handleSubmit} style={{ width: "100%" }}>
                <input
                    type="email"
                    value={email}
                    onChange={(e) =>
                        setState((s) => ({
                            ...s,
                            email: e.target.value,
                            error: "",
                        }))
                    }
                    placeholder={placeholder}
                    disabled={loading}
                    required
                    style={{
                        width: "100%",
                        padding: "15px",
                        borderRadius: 5,
                        border: error ? "2px solid #dc2626" : "2px solid #ddd",
                        fontSize: 16,
                        boxSizing: "border-box",
                        marginBottom: 15,
                        outline: "none",
                        transition: "border-color 0.2s",
                    }}
                />
                <button
                    type="submit"
                    disabled={loading || !email}
                    style={{
                        width: "100%",
                        padding: "15px 30px",
                        borderRadius: 5,
                        border: "none",
                        fontSize: 16,
                        fontWeight: "bold",
                        background: loading ? "#ccc" : "#007cba",
                        color: "white",
                        cursor: loading || !email ? "not-allowed" : "pointer",
                        opacity: loading || !email ? 0.7 : 1,
                        transition: "opacity 0.2s, background 0.2s",
                    }}
                >
                    {loading ? loadingText : buttonText}
                </button>
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
            </form>
        )
    }
)

// Stripe Checkout Component
const StripeCheckout = React.memo(({ email, isFromFunnelB }) => {
    const [state, setState] = useState({ loading: true, error: null })
    const mounted = useRef(false)
    const checkout = useRef(null)

    useEffect(() => {
        if (!email || mounted.current) return

        const controller = new AbortController()

        ;(async () => {
            try {
                const { fbc, fbp } = helpers.getFbData()

                const res = await fetch(API_ENDPOINT, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email,
                        funnel_type: isFromFunnelB ? "option_b" : "option_a",
                        current_locale: helpers.getLocale(),
                        combined_flow: !isFromFunnelB,
                        metadata: { fbc: fbc || "", fbp: fbp || "" },
                    }),
                    signal: controller.signal,
                })

                if (!res.ok) throw new Error("Session creation failed")

                const { clientSecret } = await res.json()
                const stripe = await loadStripe()

                if (!controller.signal.aborted && stripe) {
                    checkout.current = await stripe.initEmbeddedCheckout({
                        clientSecret,
                    })
                    checkout.current.mount("#stripe-checkout")
                    mounted.current = true
                    setState({ loading: false, error: null })
                }
            } catch (err) {
                if (err.name !== "AbortError") {
                    setState({
                        loading: false,
                        error: "Could not load payment form",
                    })
                }
            }
        })()

        return () => {
            controller.abort()
            if (checkout.current) {
                checkout.current.destroy()
                mounted.current = false
            }
        }
    }, [email, isFromFunnelB])

    if (state.error) {
        return (
            <div style={{ color: "#dc2626", padding: 20, textAlign: "center" }}>
                {state.error}
            </div>
        )
    }

    return (
        <div style={{ width: "100%", minHeight: 600 }}>
            <div id="stripe-checkout" />
            {state.loading && (
                <div
                    style={{ textAlign: "center", padding: 40, color: "#666" }}
                >
                    Loading secure payment form...
                </div>
            )}
        </div>
    )
})

// Main Component
export default function EmailAndCheckout(props) {
    const [state, setState] = useState({
        email: "",
        showCheckout: false,
        isFromFunnelB: false,
    })

    useEffect(() => {
        const email = new URLSearchParams(window.location.search).get("email")
        if (email) {
            setState({ email, showCheckout: true, isFromFunnelB: true })

            window.dataLayer?.push({
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
                    funnel_type: "option_b",
                    locale: helpers.getLocale(),
                    combined_flow: false,
                },
            })
        }
    }, [])

    const handleEmailSubmit = (email) => {
        setState({ email, showCheckout: true, isFromFunnelB: false })

        window.dataLayer?.push({
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
                locale: helpers.getLocale(),
                combined_flow: true,
            },
        })
    }

    return state.showCheckout ? (
        <StripeCheckout
            email={state.email}
            isFromFunnelB={state.isFromFunnelB}
        />
    ) : (
        <EmailStep
            onSubmit={handleEmailSubmit}
            placeholder={props.emailPlaceholder}
            buttonText={props.emailButtonText}
            loadingText={props.emailLoadingText}
            invalidEmailError={props.emailErrorText}
            errorMessage={props.generalErrorText}
        />
    )
}

// Property controls - only form controls
addPropertyControls(EmailAndCheckout, {
    emailPlaceholder: {
        type: ControlType.String,
        title: "Email Placeholder",
        defaultValue: "Enter your email address",
    },
    emailButtonText: {
        type: ControlType.String,
        title: "Button Text",
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
})
