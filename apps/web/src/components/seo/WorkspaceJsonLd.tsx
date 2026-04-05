import { Helmet } from 'react-helmet-async'
import type { TimelineSegment } from '../../data/appData'
import { secondsToSchemaDuration } from '../../lib/lectureSeo'
import { canonicalUrl, getSiteUrl, SITE_NAME } from '../../lib/site'

type WorkspaceJsonLdProps = {
  lectureId: string
  lectureTitle: string
  courseName: string
  videoUrl: string
  segments: TimelineSegment[]
}

/**
 * JSON-LD @graph: Course, VideoObject (hasPart → Clip), EducationEvent, SoftwareApplication.
 */
export function WorkspaceJsonLd({
  lectureId,
  lectureTitle,
  courseName,
  videoUrl,
  segments,
}: WorkspaceJsonLdProps) {
  const site = getSiteUrl()
  const path = `/workspace?lecture=${encodeURIComponent(lectureId)}`
  const pageUrl = canonicalUrl(path) ?? (site ? `${site}${path}` : undefined)
  const base = pageUrl ?? ''
  const courseId = `${base}#course`
  const videoId = `${base}#video`
  const org = {
    '@type': 'Organization',
    name: SITE_NAME,
    ...(site ? { url: site } : {}),
  }

  const clips = segments.map((seg) => ({
    '@type': 'Clip',
    '@id': `${base}#clip-${seg.id}`,
    name: seg.label,
    startOffset: secondsToSchemaDuration(seg.startSeconds),
    isPartOf: { '@id': videoId },
  }))

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Course',
        '@id': courseId,
        name: courseName,
        description: `Khóa học gồm bài giảng “${lectureTitle}”, cấu trúc hóa bằng AI trong ${SITE_NAME}.`,
        provider: org,
        hasCourseInstance: {
          '@type': 'CourseInstance',
          name: lectureTitle,
          courseMode: 'online',
        },
      },
      {
        '@type': 'VideoObject',
        '@id': videoId,
        name: lectureTitle,
        description: `Video “${lectureTitle}” (${courseName}) — mốc thời gian liên kết sơ đồ tư duy AI.`,
        embedUrl: videoUrl,
        contentUrl: videoUrl,
        isPartOf: { '@id': courseId },
        hasPart: clips,
      },
      {
        '@type': 'EducationEvent',
        name: `Phiên học trực tuyến: ${lectureTitle}`,
        description: `Theo dõi video và sơ đồ tư duy; các mốc thời gian nằm trong VideoObject/hasPart (Clip).`,
        eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
        location: {
          '@type': 'VirtualLocation',
          url: pageUrl || (site ? `${site}/workspace` : 'https://example.com/workspace'),
        },
        organizer: org,
        ...(pageUrl ? { url: pageUrl } : {}),
        about: { '@id': courseId },
      },
      {
        '@type': 'SoftwareApplication',
        name: `${SITE_NAME} — Video Workspace`,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Web',
        description: 'Workspace: video, AI mindmap, deep time-linking, tutor.',
        ...(pageUrl ? { url: pageUrl } : {}),
      },
    ],
  }

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(graph)}</script>
    </Helmet>
  )
}
