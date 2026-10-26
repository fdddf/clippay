import { Composition, registerRoot } from "remotion";
import { Demo } from "./Demo";
import { FPS, totalFrames } from "./timeline";

function Root() {
  return <Composition id="Demo" component={Demo} durationInFrames={totalFrames} fps={FPS} width={1920} height={1080} />;
}

registerRoot(Root);
