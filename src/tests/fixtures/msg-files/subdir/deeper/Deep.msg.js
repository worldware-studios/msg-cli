// MsgResource in deeply nested directory
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
    title: "Deep",
    attributes: { lang: "en", dir: "ltr" },
    messages: [{ key: "deep-msg", value: "From deep subdir" }],
  },
  project
);
