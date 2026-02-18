import { MsgProject } from "@worldware/msg";

const project = MsgProject.create({
  project: { name: "test" },
  locales: {
    sourceLocale: "en",
    pseudoLocale: "en-XA",
    targetLocales: {
      en: ["en"],
      zh: ["zh"],
    },
  },
  loader: async () => ({
    title: "",
    attributes: { lang: "", dir: "", dnt: false },
    messages: [],
  }),
});

export default project;
