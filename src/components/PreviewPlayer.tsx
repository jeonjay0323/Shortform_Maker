"use client";

import { Player } from "@remotion/player";
import { ShortVideo, type Bgm, type Sfx } from "@/video/ShortVideo";
import { FPS, HEIGHT, WIDTH, totalDuration, type VideoSpec, type Voice } from "@/video/spec";

export default function PreviewPlayer({
  spec,
  images,
  bgm,
  sfx,
  tension,
  voices,
}: {
  spec: VideoSpec;
  images: string[];
  bgm: Bgm | null;
  sfx: Sfx;
  tension: boolean;
  voices: (Voice | null)[];
}) {
  return (
    <Player
      component={ShortVideo}
      inputProps={{ spec, images, bgm, sfx, tension, voices }}
      durationInFrames={totalDuration(spec, voices)}
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
