import { colorThemes, templates } from "@/lib/email-data"

export default function EmailPreview({ data, selectedTheme, bgImage }) {
  const templateStyles = {
    business: {
      container: "bg-gray-100 p-6 rounded-lg",
      header: "text-2xl font-bold text-gray-800",
      subheader: "text-lg text-gray-600 mt-2",
      content: "mt-4 text-gray-700",
      button: "mt-6 px-6 py-2 rounded-md text-white font-medium",
    },
    event: {
      container: "bg-green-50 p-6 rounded-lg",
      header: "text-3xl font-bold text-green-800",
      subheader: "text-xl text-green-600 mt-2",
      content: "mt-6 text-green-700",
      button: "mt-6 px-6 py-3 rounded-full text-white font-medium",
    },
    realestate: {
      container: "bg-orange-50 p-6 rounded-lg",
      header: "text-2xl font-bold text-orange-800",
      subheader: "text-lg text-orange-600 mt-2",
      content: "mt-4 text-orange-700",
      button: "mt-6 px-6 py-2 rounded-md text-white font-medium",
    },
    confirmation: {
      container: "bg-blue-50 p-6 rounded-lg",
      header: "text-2xl font-bold text-blue-800",
      subheader: "text-lg text-blue-600 mt-2",
      content: "mt-4 text-blue-700",
      button: "mt-6 px-6 py-2 rounded-md text-white font-medium",
    },
    corporate: {
      container: "bg-gray-100 p-6 rounded-lg",
      header: "text-2xl font-bold text-gray-800",
      subheader: "text-lg text-gray-600 mt-2",
      content: "mt-4 text-gray-700",
      button: "mt-6 px-6 py-2 rounded-md text-white font-medium",
    },
    newsletter: {
      container: "bg-purple-50 p-6 rounded-lg",
      header: "text-2xl font-bold text-purple-800",
      subheader: "text-lg text-purple-600 mt-2",
      content: "mt-4 text-purple-700",
      button: "mt-6 px-6 py-2 rounded-md text-white font-medium",
    },
    welcome: {
      container: "bg-yellow-50 p-6 rounded-lg",
      header: "text-3xl font-bold text-yellow-800",
      subheader: "text-xl text-yellow-700 mt-2",
      content: "mt-4 text-yellow-700",
      button: "mt-6 px-6 py-2 rounded-md text-white font-medium",
    },
    product: {
      container: "bg-indigo-50 p-6 rounded-lg",
      header: "text-2xl font-bold text-indigo-800",
      subheader: "text-lg text-indigo-600 mt-2",
      content: "mt-4 text-indigo-700",
      button: "mt-6 px-6 py-2 rounded-md text-white font-medium",
    },
    promotion: {
      container: "bg-red-50 p-6 rounded-lg",
      header: "text-3xl font-bold text-red-800",
      subheader: "text-xl text-red-600 mt-2",
      content: "mt-4 text-red-700",
      button: "mt-6 px-6 py-2 rounded-md text-white font-medium",
    },
    thankyou: {
      container: "bg-teal-50 p-6 rounded-lg",
      header: "text-2xl font-bold text-teal-800",
      subheader: "text-lg text-teal-600 mt-2",
      content: "mt-4 text-teal-700",
      button: "mt-6 px-6 py-2 rounded-md text-white font-medium",
    },
    holiday: {
      container: "bg-blue-50 p-6 rounded-lg",
      header: "text-2xl font-bold text-blue-800 text-center",
      subheader: "text-lg text-blue-600 mt-2 text-center",
      content: "mt-4 text-blue-700 text-center",
      button: "mt-6 px-6 py-2 rounded-md text-white font-medium",
    },
  }

  const styles = templateStyles[data.emailType]

  const themeColors = selectedTheme !== null ? colorThemes[selectedTheme] : null
  const bgStyle = bgImage
    ? { backgroundImage: `url(${bgImage})`, backgroundSize: "cover" }
    : themeColors
      ? { backgroundColor: themeColors[0] }
      : {}

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white p-4 border-b flex items-center justify-between">
        <h3 className="font-medium">Email Preview</h3>
        <div className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">{templates[data.emailType].name}</div>
      </div>
      <div className="overflow-auto">
        <div className={styles.container} style={{ ...bgStyle }}>
        {data.logoUrl ? (
  <div className="h-16 w-16 rounded-full overflow-hidden relative">
    <img
      src={data.logoUrl}
      alt={data.companyName}
      className="object-cover w-full h-full"
      onError={(e) => console.error("Image failed to load:", e)}
    />
    {console.log("Using logo URL:", data.logoUrl.substring(0, 50) + "...")}
  </div>
) : (
  <div className="h-16 w-16 bg-gray-300 rounded-full flex items-center justify-center">
    <span className="text-lg font-bold">{data.companyName.charAt(0)}</span>
  </div>
)}
          <h1 className={styles.header}>{data.headerText}</h1>
          <h2 className={styles.subheader}>{data.subheaderText}</h2>
          <div
            className={styles.content}
            dangerouslySetInnerHTML={{ __html: data.mainContent.replace(/\n/g, "<br/>") }}
          />
          <div className="flex justify-center">
            <a
              href={data.ctaUrl}
              className={styles.button}
              style={{
                backgroundColor: themeColors ? themeColors[2] : data.accentColor,
                display: "inline-block",
                textDecoration: "none",
                color: "white",
              }}
              target="_blank"
              rel="noopener noreferrer"
            >
              {data.ctaText}
            </a>
          </div>
          {data.footerText && (
            <div className="mt-8 pt-4 border-t border-gray-300 text-sm text-gray-500 text-center">
              {data.footerText}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
