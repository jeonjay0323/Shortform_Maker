"use client";

import { Player } from "@remotion/player";
import { ShortVideo } from "@/video/ShortVideo";
import { FPS, HEIGHT, WIDTH, totalDuration, type VideoSpec } from "@/video/spec";

export default function PreviewPlayer({ spec, images }: { spec: VideoSpec; images: string[] }) {
  return (
    <Player
      component={ShortVideo}
      inputProps={{ spec, images }}
      durationInFrames={totalDuration(spec)}
      fps={FPS}
      compositionWidth={WIDTH}
      compositionHeight={HEIGHT}
      style={{ width: "100%", aspectRatio: "9 / 16" }}
      controls
      loop
      autoPlay
      acknowledgeRemotionLicense
    />
  );
}
