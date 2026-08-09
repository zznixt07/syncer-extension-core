export const hostMediaFallbackFromEvent = (event: any) => {
  const media = event?.data?.media;
  if (!media || media.url) return null;
  return {service: event.data.source?.service || event.data.source?.adapter, applicationId: event.data.source?.applicationId, title: media.title, artist: media.artist, durationMs: media.durationMs};
};
