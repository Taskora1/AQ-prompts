function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export default function JsonLd({ data }) {
  const items = (Array.isArray(data) ? data : [data]).filter(Boolean);

  if (items.length === 0) return null;

  return items.map((item, index) => (
    <script
      key={index}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJson(item) }}
    />
  ));
}
