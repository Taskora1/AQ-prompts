'use client';

/**
 * Wraps children with attributes that prevent translation tools
 * (Google Translate, Microsoft Translator, DeepL extension) from
 * altering the DOM inside.
 *
 * Usage:
 *   <NoTranslate>
 *     <YourDynamicComponent />
 *   </NoTranslate>
 *
 *   <NoTranslate className="my-class">
 *     <span>Price: $49.99</span>
 *   </NoTranslate>
 */

export default function NoTranslate({
  children,
  className = '',
  as: Tag = 'div',
  style,
  ...rest
}) {
  return (
    <Tag
      className={className}
      translate="no"
      notranslate="true"
      style={style}
      {...rest}
    >
      {children}
    </Tag>
  );
}