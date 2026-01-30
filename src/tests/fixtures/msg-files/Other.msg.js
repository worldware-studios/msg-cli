// ESM-style .msg. file for testing
import { MsgProject, MsgResource } from "@worldware/msg";

const project = MsgProject.create({
  project: { name: "test" },
  locales: {
    sourceLocale: "en",
    pseudoLocale: "en-XA",
    targetLocales: { en: ["en"] },
  },
  loader: async () => ({
    title: "",
    attributes: { lang: "", dir: "", dnt: false },
    messages: [],
  }),
});

export default MsgResource.create(
  {
    title: "Other",
    attributes: { lang: "en", dir: "ltr" },
    messages: [{ key: "greeting", value: "Hi there" }],
  },
  project
);
