import React from "react"

// IMPORTANT: Update this to your actual checkout function URL
const API_ENDPOINT = "https://ce-stripe-form-3iw4kbqopa-uc.a.run.app"

// Helper function to get Facebook Click ID
const getFacebookClickId = () => {
    if (typeof window === "undefined") {
        return null
    }

    // Get fbclid from URL
    const urlParams = new URLSearchParams(window.location.search)
    const fbclid = urlParams.get("fbclid")

    if (fbclid) {
        // Create/update the fbc cookie
        const fbc = `fb.1.${Date.now()}.${fbclid}`
        document.cookie = `_fbc=${fbc}; max-age=604800; path=/; domain=.captainenglish.com`
        return fbclid
    }

    // Try to get fbclid from existing cookie
    const fbcCookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith("_fbc="))
    if (fbcCookie) {
        // Extract fbclid from fbc cookie format: fb.1.timestamp.fbclid
        const parts = fbcCookie.split("=")[1].split(".")
        if (parts.length >= 4) {
            return parts.slice(3).join(".")
        }
    }

    return null
}

export default function EmailCaptureStep(props) {
    const [email, setEmail] = React.useState("")
    const [isLoading, setLoading] = React.useState(false)
    const [error, setError] = React.useState("")

    const handleSubmit = async () => {
        setError("")

        // Basic email validation
        if (!email.includes("@")) {
            const errorMsg =
                props.invalidEmailError || "Please enter a valid email address."
            setError(errorMsg)

            // Log validation error to Sentry
            if (window.Sentry && window.Sentry.addBreadcrumb) {
                window.Sentry.addBreadcrumb({
                    category: "email_capture",
                    message: "Email validation failed",
                    level: "warning",
                    data: { email: email },
                })
            }

            return
        }

        setLoading(true)

        try {
            // Get locale from URL (only on client-side)
            let locale = ""
            if (typeof window !== "undefined") {
                const path = window.location.pathname
                const parts = path.split("/").filter(Boolean)
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
                locale = locales.includes(parts[0]) ? parts[0] : ""
            }

            // Get Facebook Click ID
            const fbclid = getFacebookClickId()

            // Log API call attempt
            if (window.Sentry && window.Sentry.addBreadcrumb) {
                window.Sentry.addBreadcrumb({
                    category: "api",
                    message: "Creating lead",
                    level: "info",
                    data: {
                        email: email.trim(),
                        locale: locale,
                        has_fbclid: !!fbclid,
                        api_endpoint: API_ENDPOINT,
                    },
                })
            }

            // API call with better error handling
            let response
            try {
                response = await fetch(API_ENDPOINT, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                    },
                    body: JSON.stringify({
                        action: "create_lead",
                        email: email.trim(),
                        current_locale: locale,
                        // Add Facebook tracking data
                        metadata: {
                            fbclid: fbclid || "",
                            source: "email_capture_step",
                            user_agent: navigator.userAgent || "", // ADD THIS LINE
                        },
                    }),
                })
            } catch (fetchError) {
                // Network error - log more details
                console.error("Fetch error:", fetchError)
                if (window.Sentry && window.Sentry.captureException) {
                    window.Sentry.captureException(fetchError, {
                        tags: {
                            component: "EmailCaptureStep",
                            action: "create_lead",
                            error_type: "network_error",
                        },
                        extra: {
                            email: email.trim(),
                            error_message: fetchError.message,
                            api_endpoint: API_ENDPOINT,
                            error_stack: fetchError.stack,
                        },
                    })
                }
                throw new Error(
                    "Network error: Could not connect to server. Please check your internet connection and try again."
                )
            }

            // Check if response is ok
            if (!response.ok) {
                const errorText = await response.text()
                console.error("API error response:", response.status, errorText)
                throw new Error(`Server error: ${response.status}`)
            }

            // Parse JSON response
            let result
            try {
                result = await response.json()
            } catch (jsonError) {
                console.error("JSON parse error:", jsonError)
                throw new Error("Invalid response from server")
            }

            if (
                result.status === "lead_created" ||
                result.status === "lead_already_exists"
            ) {
                // Set user context in Sentry
                if (window.Sentry && window.Sentry.setUser) {
                    window.Sentry.setUser({ email: email.trim() })
                }

                // Log successful lead creation
                if (window.Sentry && window.Sentry.addBreadcrumb) {
                    window.Sentry.addBreadcrumb({
                        category: "email_capture",
                        message: "Lead created successfully",
                        level: "info",
                        data: {
                            status: result.status,
                            email: email.trim(),
                            locale: locale,
                            has_fbclid: !!fbclid,
                        },
                    })
                }

                // Track analytics event
                if (window.dataLayer) {
                    window.dataLayer.push({
                        event: "generate_lead",
                        lead_details: {
                            email: email.trim(),
                            locale: locale,
                            source: "email_capture_step",
                            status: result.status,
                            has_fbclid: !!fbclid,
                        },
                    })
                }

                // Redirect with locale and fbclid (only on client-side)
                if (typeof window !== "undefined") {
                    const localePath = locale ? "/" + locale : ""
                    let redirectUrl =
                        "https://captainenglish.com" +
                        localePath +
                        "/personal-plan/get-pro?email=" +
                        encodeURIComponent(email.trim())

                    // Preserve fbclid in redirect URL
                    if (fbclid) {
                        redirectUrl += "&fbclid=" + encodeURIComponent(fbclid)
                    }

                    if (window.Sentry && window.Sentry.addBreadcrumb) {
                        window.Sentry.addBreadcrumb({
                            category: "navigation",
                            message: "Redirecting to checkout",
                            level: "info",
                            data: {
                                redirect_url: redirectUrl,
                                has_fbclid: !!fbclid,
                            },
                        })
                    }

                    window.location.href = redirectUrl
                }
            } else {
                throw new Error(
                    result.error ||
                        `Unexpected API response status: ${result.status}`
                )
            }
        } catch (err) {
            // Capture error in Sentry with context
            if (window.Sentry && window.Sentry.captureException) {
                window.Sentry.captureException(err, {
                    tags: {
                        component: "EmailCaptureStep",
                        action: "create_lead",
                    },
                    extra: {
                        email: email.trim(),
                        error_message: err.message,
                        api_endpoint: API_ENDPOINT,
                    },
                })
            }

            // User-friendly error messages
            let errorMsg =
                props.errorMessage || "Something went wrong. Please try again."

            if (err.message.includes("Network error")) {
                errorMsg =
                    "Connection error. Please check your internet and try again."
            } else if (err.message.includes("Server error")) {
                errorMsg = "Server error. Please try again in a moment."
            }

            setError(errorMsg)
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
                        if (e.key === "Enter" && !isLoading) {
                            handleSubmit()
                        }
                    }}
                    placeholder={
                        props.placeholder || "Enter your email address"
                    }
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
                        ? props.loadingText || "Processing..."
                        : props.buttonText || "Let's do this!"}
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
