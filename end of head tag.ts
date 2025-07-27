<!-- Performance Optimization - Resource Hints -->
<link rel="preconnect" href="https://js.stripe.com">
<link rel="preconnect" href="https://www.googletagmanager.com">
<link rel="preconnect" href="https://js-de.sentry-cdn.com">
<link rel="preconnect" href="https://a.klaviyo.com">
<link rel="preconnect" href="https://ce-stripe-form-3iw4kbqopa-uc.a.run.app">
<link rel="preconnect" href="https://ce-stripe-upsell-form-3iw4kbqopa-uc.a.run.app">

<!-- DNS prefetch for external domains -->
<link rel="dns-prefetch" href="//fonts.googleapis.com">
<link rel="dns-prefetch" href="//fonts.gstatic.com">
<link rel="dns-prefetch" href="//graph.facebook.com">

<!-- Preload critical resources -->
<link rel="preload" href="https://js.stripe.com/v3/" as="script">
<link rel="preload" href="https://www.googletagmanager.com/gtm.js?id=GTM-PNZNCXJQ" as="script">
<!-- Google Tag Manager - Optimized -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-PNZNCXJQ');</script>
<!-- End Google Tag Manager -->

<!-- Sentry Logging - Optimized -->
<link rel="preload" href="https://js-de.sentry-cdn.com/3312ad27a955c93ea3f7ba0013b77b11.min.js" as="script" crossorigin="anonymous">
<script src="https://js-de.sentry-cdn.com/3312ad27a955c93ea3f7ba0013b77b11.min.js" crossorigin="anonymous" defer></script>
<!-- End of Sentry Logging -->
<script>
// Fix for Facebook browser error
if (navigator.userAgent.indexOf("FBAN") > -1 || navigator.userAgent.indexOf("FBAV") > -1) {
    window.addEventListener('error', function(e) {
        if (e.message && e.message.includes('null is not an object')) {
            e.preventDefault();
            return true;
        }
    });
}
</script>