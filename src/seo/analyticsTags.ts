export const PRODUCTION_ANALYTICS_PLACEHOLDER = "<!-- __PRODUCTION_ANALYTICS__ -->";

export function renderProductionAnalyticsTags(enabled: boolean): string {
  if (!enabled) return "";

  return `<!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-0W5T7N4B2Y"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-0W5T7N4B2Y');
    </script>
    <script>
      (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", "y0jxe2o34f");
    </script>`;
}
