import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID || "q9bney02",
    dataset: process.env.SANITY_STUDIO_DATASET || "production",
  },
  // No appId pinned: the previous one belonged to the retired project
  // 4w1vahgy. Sanity allocates a fresh App SDK app on the first deploy
  // against this project and writes the id back here.
  studioHost: "cwn-finance-live-studio",
  // Allocated by Sanity on the first deploy against q9bney02. The previous
  // appId belonged to the retired project 4w1vahgy.
  deployment: {
    appId: "ib7qcgaerf7akzgbudoz3wgo",
  },
});