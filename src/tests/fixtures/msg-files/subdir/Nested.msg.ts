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
    title: "Nested",
    attributes: { lang: "en", dir: "ltr" },
    messages: [{ key: "nested-msg", value: "From subdir" }],
  },
  project
);
