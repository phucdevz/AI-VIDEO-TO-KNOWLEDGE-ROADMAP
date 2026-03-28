import { Helmet } from 'react-helmet-async'
import { canonicalUrl, SITE_NAME } from '../../lib/site'

type PageMetaProps = {
  /** Tên ngắn (tab mặc định: `${title} | ${SITE_NAME}` nếu không có documentTitle). */
  title: string
  /** Meta description + og:description mặc định. */
  description: string
  /** Path có query, ví dụ `/workspace?lecture=1`. */
  path?: string
  noindex?: boolean
  /** Ghi đè toàn bộ thẻ <title> (dùng cho bài giảng: tiêu đề dài tiếng Việt + brand). */
  documentTitle?: string
  /** og:title / twitter:title (ví dụ không thêm "| EtherAI"). */
  ogTitle?: string
  /** og:description / twitter:description. */
  ogDescription?: string
}

/**
 * Per-route title, description, canonical, Open Graph.
 */
export function PageMeta({
  title,
  description,
  path = '/',
  noindex,
  documentTitle,
  ogTitle,
  ogDescription,
}: PageMetaProps) {
  const htmlTitle = documentTitle ?? `${title} | ${SITE_NAME}`
  const ogt = ogTitle ?? htmlTitle
  const ogd = ogDescription ?? description
  const canonical = canonicalUrl(path)

  return (
    <Helmet>
      <html lang="en" />
      <title>{htmlTitle}</title>
      <meta name="description" content={description} />
      {noindex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}
      {canonical ? <link rel="canonical" href={canonical} /> : null}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={ogt} />
      <meta property="og:description" content={ogd} />
      <meta property="og:type" content="website" />
      {canonical ? <meta property="og:url" content={canonical} /> : null}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={ogt} />
      <meta name="twitter:description" content={ogd} />
    </Helmet>
  )
}
