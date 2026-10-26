import { Config } from "@remotion/cli/config";

// Use the installed Chrome rather than downloading chrome-headless-shell.
Config.setBrowserExecutable(process.env.REMOTION_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
Config.setEntryPoint("src/index.tsx");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
