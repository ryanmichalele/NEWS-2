import { defineField, defineType } from "sanity";

export const storySettings = defineType({
  name: "storySettings",
  title: "Story Settings",
  type: "document",
  groups: [
    { name: "editable", title: "Editable — change these three" },
    { name: "keys", title: "Search keys (advanced)" },
  ],
  fields: [
    defineField({
      name: "bankName",
      title: "Bank name",
      type: "string",
      group: "editable",
      validation: (Rule) => Rule.required(),
      description: "Replaces every occurrence across the whole page.",
    }),
    defineField({
      name: "locationName",
      title: "Location",
      type: "string",
      group: "editable",
      validation: (Rule) => Rule.required(),
      description: "Replaces every occurrence across the whole page.",
    }),
    defineField({
      name: "advisorName",
      title: "Advisor name",
      type: "string",
      group: "editable",
      validation: (Rule) => Rule.required(),
      description: "Replaces every occurrence across the whole page.",
    }),
    defineField({
      name: "bankKey",
      title: "Bank search key",
      type: "string",
      group: "keys",
      initialValue: "Edward Jones",
      description: "The literal text currently in the content. Rarely needs changing.",
    }),
    defineField({
      name: "locationKey",
      title: "Location search key",
      type: "string",
      group: "keys",
      initialValue: "Louisiana",
      description: "The literal text currently in the content. Rarely needs changing.",
    }),
    defineField({
      name: "advisorKey",
      title: "Advisor search key",
      type: "string",
      group: "keys",
      initialValue: "Beau Wilson",
      description: "The literal text currently in the content. Rarely needs changing.",
    }),
  ],
  preview: {
    prepare() {
      return { title: "Story Settings" };
    },
  },
});