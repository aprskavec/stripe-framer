import * as React from "react"
import { useState, useEffect, useCallback } from "react"

const KL_PUBLIC_API = "SdkzWJ"

// Just add your list IDs here
const KLAVIYO_LISTS = {
    en: "TX2fgv", // English list
    es: "RkpK9F", // Spanish list
    ar: "Sgw53H", // Arabic list
    ja: "UwGuu3", // Japanese list
    hi: "VwQNF7", // Hindi list
    fr: "Xa2buN", // French list
}

function KlaviyoSignup({
    placeholder = "Enter your email",
    buttonLabel = "Join the list",
    loadingText = "…",
    successMessage = "Check your email",
    errorInvalidEmail = "Please enter a valid email.",
    style = {},
    onSubmit,
    debug = false,
}) {
    const [email, setEmail] = useState("")
    const [isLoading, setLoading] = useState(false)
    const [isError, setError] = useState(false)
    const [isSuccess, setSuccess] = useState(false)
    const [msg, setMsg] = useState("")
    const [lang, setLang] = useState("en")
    const [componentLoaded, setComponentLoaded] = useState(false)

    // Safe Sentry breadcrumb function
    const addSentryBreadcrumb = useCallback(
        (message, data = null, level = "info") => {
            try {
                if (
                    typeof window !== "undefined" &&
                    window.Sentry &&
                    typeof window.Sentry.addBreadcrumb === "function"
                ) {
                    window.Sentry.addBreadcrumb({
                        category: "klaviyo_signup",
                        message: message,
                        level: level,
                        data: data || {},
                    })
                }

                if (debug) {
                    console.log(`${new Date().toISOString()}: ${message}`, data)
                }
            } catch (e) {
                console.error("Sentry breadcrumb failed:", e)
            }
        },
        [debug]
    )

    // Safe environment check
    const isProductionEnvironment = useCallback(() => {
        try {
            if (typeof window === "undefined") return false
            const hostname = window.location?.hostname || ""
            const isFramer =
                hostname.includes("framer") ||
                hostname.includes("invalid") ||
                hostname.includes("preview") ||
                hostname.includes("localhost")
            const isProd = !isFramer && hostname === "captainenglish.com"
            return isProd
        } catch (e) {
            addSentryBreadcrumb(
                "Environment Check Error",
                { error: e.message },
                "error"
            )
            return false
        }
    }, [addSentryBreadcrumb])

    // Safe email validation
    const validateEmail = useCallback(
        (e) => {
            try {
                if (!e || typeof e !== "string") return false
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
            } catch (error) {
                addSentryBreadcrumb(
                    "Email validation error",
                    { error: error.message },
                    "error"
                )
                return false
            }
        },
        [addSentryBreadcrumb]
    )

    // Component initialization
    useEffect(() => {
        try {
            const initData = {
                userAgent:
                    (typeof navigator !== "undefined" && navigator.userAgent) ||
                    "Unknown",
                url:
                    (typeof window !== "undefined" && window.location?.href) ||
                    "Unknown",
                reactVersion: React.version || "Unknown",
            }

            addSentryBreadcrumb("Component Initializing", initData)
            setComponentLoaded(true)
        } catch (e) {
            if (
                typeof window !== "undefined" &&
                window.Sentry &&
                typeof window.Sentry.captureException === "function"
            ) {
                window.Sentry.captureException(e, {
                    tags: {
                        component: "KlaviyoSignup",
                        action: "initialization",
                    },
                })
            }
            addSentryBreadcrumb(
                "Component Init Error",
                { error: e.message },
                "error"
            )
            // Still set component as loaded even if there's an error
            setComponentLoaded(true)
        }
    }, [addSentryBreadcrumb])

    // Language detection
    useEffect(() => {
        if (!componentLoaded) return

        try {
            if (typeof window !== "undefined" && window.location) {
                const pathname = window.location.pathname || ""
                const cleanPath = pathname.replace(/^\/|\/$/g, "")
                const segments = cleanPath.split("/").filter(Boolean) || []
                const firstSegment = segments[0] || ""
                const detectedLang = KLAVIYO_LISTS[firstSegment]
                    ? firstSegment
                    : "en"

                setLang(detectedLang)

                addSentryBreadcrumb("Language Detection", {
                    pathname: pathname,
                    detectedLang: detectedLang,
                    listId: KLAVIYO_LISTS[detectedLang],
                })
            }
        } catch (e) {
            if (
                typeof window !== "undefined" &&
                window.Sentry &&
                typeof window.Sentry.captureException === "function"
            ) {
                window.Sentry.captureException(e, {
                    tags: {
                        component: "KlaviyoSignup",
                        action: "language_detection",
                    },
                })
            }
            addSentryBreadcrumb(
                "Language Detection Error",
                { error: e.message },
                "error"
            )
            setLang("en") // fallback
        }
    }, [componentLoaded, addSentryBreadcrumb])

    // Safe fallback submission
    const fallbackSubmit = useCallback(
        async (email, listId) => {
            try {
                if (typeof document === "undefined") return false

                // Create a hidden form and submit it
                const form = document.createElement("form")
                form.action = `https://manage.kmail-lists.com/subscriptions/subscribe`
                form.method = "POST"
                form.style.display = "none"

                const emailInput = document.createElement("input")
                emailInput.type = "email"
                emailInput.name = "email"
                emailInput.value = email

                const listInput = document.createElement("input")
                listInput.type = "hidden"
                listInput.name = "list"
                listInput.value = listId

                const companyInput = document.createElement("input")
                companyInput.type = "hidden"
                companyInput.name = "company_id"
                companyInput.value = KL_PUBLIC_API

                form.appendChild(emailInput)
                form.appendChild(listInput)
                form.appendChild(companyInput)

                document.body.appendChild(form)

                addSentryBreadcrumb("Using fallback form submission", {
                    listId,
                })

                // Note: This will redirect the page, but it's a fallback
                form.submit()

                return true
            } catch (e) {
                addSentryBreadcrumb(
                    "Fallback submission failed",
                    { error: e.message },
                    "error"
                )
                if (
                    typeof window !== "undefined" &&
                    window.Sentry &&
                    typeof window.Sentry.captureException === "function"
                ) {
                    window.Sentry.captureException(e, {
                        tags: {
                            component: "KlaviyoSignup",
                            action: "fallback_submit",
                        },
                    })
                }
                return false
            }
        },
        [addSentryBreadcrumb]
    )

    // Main submit handler
    const handleSubmit = useCallback(async () => {
        try {
            setError(false)
            setMsg("")
            const trimmedEmail = (email || "").trim()

            addSentryBreadcrumb("Submit Started", { email: trimmedEmail })

            if (!validateEmail(trimmedEmail)) {
                setError(true)
                setMsg(errorInvalidEmail)
                addSentryBreadcrumb("Email Validation Failed", null, "warning")
                return
            }

            setLoading(true)

            const listId = KLAVIYO_LISTS[lang] || KLAVIYO_LISTS.en

            // Set user context in Sentry
            if (
                typeof window !== "undefined" &&
                window.Sentry &&
                typeof window.Sentry.setUser === "function"
            ) {
                window.Sentry.setUser({ email: trimmedEmail })
            }

            // Check if fetch is available
            if (typeof fetch === "undefined") {
                addSentryBreadcrumb(
                    "Fetch not available, using fallback",
                    null,
                    "warning"
                )
                const fallbackSuccess = await fallbackSubmit(
                    trimmedEmail,
                    listId
                )
                if (fallbackSuccess) {
                    setSuccess(true)
                    setEmail("")
                    if (onSubmit && typeof onSubmit === "function") {
                        onSubmit()
                    }
                    return
                } else {
                    throw new Error(
                        "Unable to submit signup. Please try again later."
                    )
                }
            }

            // Build request body for Klaviyo
            const requestBody = {
                data: {
                    type: "subscription",
                    attributes: {
                        profile: {
                            data: {
                                type: "profile",
                                attributes: {
                                    email: trimmedEmail,
                                    properties: {
                                        language: lang,
                                        signup_url:
                                            (typeof window !== "undefined" &&
                                                window.location?.href) ||
                                            "",
                                        signup_path:
                                            (typeof window !== "undefined" &&
                                                window.location?.pathname) ||
                                            "",
                                    },
                                },
                            },
                        },
                    },
                    relationships: {
                        list: {
                            data: {
                                type: "list",
                                id: listId,
                            },
                        },
                    },
                },
            }

            addSentryBreadcrumb("Request Prepared", {
                language: lang,
                listId: listId,
                companyId: KL_PUBLIC_API,
            })

            // Enhanced fetch with timeout
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 10000)

            let response
            try {
                response = await fetch(
                    `https://a.klaviyo.com/client/subscriptions/?company_id=${KL_PUBLIC_API}`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/vnd.api+json",
                            revision: "2024-10-15",
                        },
                        body: JSON.stringify(requestBody),
                        signal: controller.signal,
                        mode: "cors",
                        credentials: "omit",
                    }
                )
            } catch (fetchError) {
                clearTimeout(timeoutId)

                // Better error handling based on error type
                let errorMessage = "Signup failed. Please try again."
                let errorDetails = {
                    error: fetchError.message,
                    name: fetchError.name,
                    isOnline: navigator.onLine,
                }

                if (fetchError.name === "AbortError") {
                    errorMessage =
                        "Request timed out. Please check your connection and try again."
                    errorDetails.timeout = true
                } else if (!navigator.onLine) {
                    errorMessage =
                        "No internet connection. Please check your connection and try again."
                    errorDetails.offline = true
                } else if (
                    fetchError.message.includes("Failed to fetch") ||
                    fetchError.message.includes("NetworkError") ||
                    fetchError.message.includes("fetch")
                ) {
                    errorMessage =
                        "Connection failed. This might be due to an ad blocker or privacy extension. Please try disabling them for this site."
                    errorDetails.possibleBlocker = true
                }

                addSentryBreadcrumb(
                    "Fetch failed, trying fallback",
                    errorDetails,
                    "error"
                )

                // Try fallback method
                const fallbackSuccess = await fallbackSubmit(
                    trimmedEmail,
                    listId
                )
                if (fallbackSuccess) {
                    setSuccess(true)
                    setEmail("")
                    if (onSubmit && typeof onSubmit === "function") {
                        onSubmit()
                    }
                    return
                }

                throw new Error(errorMessage)
            }

            clearTimeout(timeoutId)

            if (!response.ok) {
                let responseData = null
                let responseText = ""

                try {
                    responseText = await response.text()
                    responseData = JSON.parse(responseText)
                } catch (parseError) {
                    responseData = { error: "Invalid response format" }
                }

                const errorMessage =
                    responseData?.errors?.[0]?.detail ||
                    responseData?.message ||
                    `Signup failed (status ${response.status})`

                throw new Error(errorMessage)
            }

            // Success tracking
            const trackSuccess = () => {
                const isProd = isProductionEnvironment()

                if (
                    isProd &&
                    typeof window !== "undefined" &&
                    window.dataLayer &&
                    Array.isArray(window.dataLayer)
                ) {
                    try {
                        // Email signup event
                        // Only push one event for the signup
                        window.dataLayer.push({
                            event: "generate_lead",
                            ecommerce: {
                                currency: "USD",
                                value: 0.0,
                                items: [
                                    {
                                        item_id: "email_signup",
                                        item_name: "Newsletter Signup",
                                        item_category: "lead",
                                        quantity: 1,
                                    },
                                ],
                            },
                            lead_details: {
                                lead_source: "klaviyo_signup",
                                lead_type: "newsletter",
                                language: lang,
                                list_id: listId,
                            },
                            user_data: {
                                email: trimmedEmail,
                                email_address: trimmedEmail,
                            },
                            event_context: {
                                page_url: window.location?.href || "",
                                page_path: window.location?.pathname || "",
                                user_agent: navigator?.userAgent || "",
                            },
                        })
                    } catch (gtmError) {
                        addSentryBreadcrumb(
                            "GTM Error (non-critical)",
                            { error: gtmError.message },
                            "warning"
                        )
                    }
                }

                // Klaviyo tracking
                if (isProd && typeof window !== "undefined") {
                    try {
                        const klaviyo = window.klaviyo || window._learnq
                        if (klaviyo && typeof klaviyo.push === "function") {
                            klaviyo.push([
                                "identify",
                                {
                                    $email: trimmedEmail,
                                    language: lang,
                                    signup_list_id: listId,
                                },
                            ])
                            klaviyo.push([
                                "track",
                                "Signed Up",
                                {
                                    $email: trimmedEmail,
                                    language: lang,
                                    list_id: listId,
                                },
                            ])
                        }
                    } catch (klaviyoError) {
                        addSentryBreadcrumb(
                            "Klaviyo tracking error (non-critical)",
                            { error: klaviyoError.message },
                            "warning"
                        )
                    }
                }
            }

            // Use requestIdleCallback if available
            if (typeof window !== "undefined" && window.requestIdleCallback) {
                window.requestIdleCallback(trackSuccess)
            } else {
                setTimeout(trackSuccess, 0)
            }

            setSuccess(true)
            setEmail("")
            if (onSubmit && typeof onSubmit === "function") {
                onSubmit()
            }
        } catch (err) {
            if (
                typeof window !== "undefined" &&
                window.Sentry &&
                typeof window.Sentry.captureException === "function"
            ) {
                window.Sentry.captureException(err, {
                    tags: {
                        component: "KlaviyoSignup",
                        action: "email_signup",
                        language: lang,
                    },
                    extra: {
                        email: (email || "").trim(),
                        list_id: KLAVIYO_LISTS[lang],
                        error_name: err.name,
                    },
                })
            }

            setError(true)
            setMsg(err.message || "Signup failed. Please try again.")
        } finally {
            setLoading(false)
        }
    }, [
        email,
        lang,
        errorInvalidEmail,
        validateEmail,
        addSentryBreadcrumb,
        fallbackSubmit,
        onSubmit,
        isProductionEnvironment,
    ])

    // Show loading state if component hasn't loaded
    if (!componentLoaded) {
        return (
            <div
                style={{
                    width: "100%",
                    padding: 20,
                    textAlign: "center",
                    ...style,
                }}
            >
                <div>Loading signup form...</div>
            </div>
        )
    }

    // Success state
    if (isSuccess) {
        return (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 20,
                    width: "100%",
                    ...style,
                }}
            >
                <div
                    style={{
                        background: "#1BD5FF",
                        width: 60,
                        height: 60,
                        borderRadius: "50%",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        marginBottom: 12,
                    }}
                >
                    <svg width="28" height="28" viewBox="0 0 28 28">
                        <path
                            d="M 2 14 L 10 22 L 26 6"
                            fill="none"
                            stroke="white"
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>
                <div
                    style={{ color: "#333", fontSize: 16, textAlign: "center" }}
                >
                    {successMessage}
                </div>
                {debug && (
                    <div
                        style={{
                            marginTop: 10,
                            fontSize: 12,
                            color: "#666",
                            textAlign: "center",
                        }}
                    >
                        Subscribed to {lang} list ({KLAVIYO_LISTS[lang]})
                    </div>
                )}
            </div>
        )
    }

    // Form state
    return (
        <div style={{ width: "100%", ...style }}>
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: 12,
                    width: "100%",
                }}
            >
                <input
                    type="email"
                    value={email || ""}
                    onChange={(e) => setEmail(e.target?.value || "")}
                    onKeyPress={(e) => {
                        if (e.key === "Enter" && !isLoading) {
                            handleSubmit()
                        }
                    }}
                    placeholder={placeholder}
                    style={{
                        width: "100%",
                        padding: "12px 16px",
                        borderRadius: 8,
                        border: isError
                            ? "1px solid #EE4444"
                            : "1px solid #ccc",
                        fontSize: 16,
                        boxSizing: "border-box",
                        transition: "border-color 0.2s",
                        outline: "none",
                    }}
                    disabled={isLoading}
                    required
                />
                <button
                    onClick={handleSubmit}
                    disabled={isLoading || !(email || "").trim()}
                    style={{
                        background: isLoading
                            ? "#ccc"
                            : "radial-gradient(circle, #0880FF 10%, #1A9DF2 50%, #1BD5FF 100%)",
                        color: isLoading ? "#666" : "black",
                        padding: "12px 24px",
                        borderRadius: 8,
                        border: "none",
                        fontWeight: 600,
                        fontSize: 18,
                        cursor:
                            isLoading || !(email || "").trim()
                                ? "default"
                                : "pointer",
                        opacity: isLoading || !(email || "").trim() ? 0.7 : 1,
                        width: "100%",
                        boxSizing: "border-box",
                        transition: "opacity 0.2s, background 0.2s",
                    }}
                >
                    {isLoading ? loadingText : buttonLabel}
                </button>
            </div>

            {isError && msg && (
                <div
                    style={{
                        color: "#EE4444",
                        fontSize: 14,
                        marginTop: 8,
                        textAlign: "center",
                    }}
                >
                    {msg}
                </div>
            )}
        </div>
    )
}

// Property controls for Framer
KlaviyoSignup.propertyControls = {
    placeholder: {
        type: "string",
        title: "Email Placeholder",
        defaultValue: "Enter your email",
    },
    buttonLabel: {
        type: "string",
        title: "Button Text",
        defaultValue: "Join the list",
    },
    loadingText: {
        type: "string",
        title: "Loading Text",
        defaultValue: "…",
    },
    successMessage: {
        type: "string",
        title: "Success Message",
        defaultValue: "Check your email",
    },
    errorInvalidEmail: {
        type: "string",
        title: "Error Message",
        defaultValue: "Please enter a valid email.",
    },
    debug: {
        type: "boolean",
        title: "Debug Mode",
        defaultValue: false,
        description: "Shows detailed component info",
    },
}

export default KlaviyoSignup
