import { defineArrayMember, defineField, defineType } from "sanity";

export const article = defineType({
  name: "article",
  title: "Article",
  type: "document",
  fields: [
    defineField({ name: "outlet", title: "Outlet", type: "string" }),
    defineField({ name: "section", title: "Section", type: "string" }),
    defineField({ name: "kicker", title: "Kicker", type: "string" }),
    defineField({ name: "title", title: "Title", type: "text", rows: 2 }),
    defineField({ name: "dek", title: "Dek", type: "text", rows: 3 }),
    defineField({ name: "byline", title: "Byline", type: "string" }),
    defineField({ name: "published", title: "Published", type: "string" }),
    defineField({ name: "updated", title: "Updated", type: "string" }),
    defineField({ name: "readTime", title: "Read time", type: "string" }),
    defineField({ name: "location", title: "Location line", type: "string" }),
    defineField({ name: "heroImage", title: "Hero image", type: "image" }),
    defineField({ name: "heroCaption", title: "Hero caption", type: "text", rows: 2 }),

    defineField({
      name: "tickerItems",
      title: "Ticker items",
      type: "array",
      of: [defineArrayMember({ type: "text" })],
    }),

    defineField({
      name: "editorNote",
      title: "Editor's note",
      type: "text",
      rows: 5,
    }),

    defineField({
      name: "bodySections",
      title: "Body sections",
      type: "array",
      of: [
        defineArrayMember({
          name: "bodySection",
          type: "object",
          fields: [
            defineField({ name: "heading", title: "Heading", type: "string" }),
            defineField({
              name: "paragraphs",
              title: "Paragraphs",
              type: "array",
              of: [defineArrayMember({ type: "text", rows: 4 })],
            }),
          ],
          preview: { select: { title: "heading" } },
        }),
      ],
    }),

    defineField({
      name: "quotes",
      title: "Quotes",
      type: "array",
      of: [
        defineArrayMember({
          name: "quote",
          type: "object",
          fields: [
            defineField({ name: "text", title: "Text", type: "text", rows: 3 }),
            defineField({ name: "source", title: "Source", type: "string" }),
          ],
          preview: { select: { title: "text", subtitle: "source" } },
        }),
      ],
    }),

    defineField({
      name: "timeline",
      title: "Timeline",
      type: "array",
      of: [
        defineArrayMember({
          name: "timelineItem",
          type: "object",
          fields: [
            defineField({ name: "date", title: "Date", type: "string" }),
            defineField({ name: "title", title: "Title", type: "string" }),
            defineField({ name: "body", title: "Body", type: "text", rows: 3 }),
          ],
          preview: { select: { title: "title", subtitle: "date" } },
        }),
      ],
    }),

    defineField({ name: "timelineHeading", title: "Timeline heading", type: "text", rows: 2 }),
    defineField({ name: "timelineKicker", title: "Timeline kicker", type: "string" }),

    defineField({ name: "protectEyebrow", title: "Protect eyebrow", type: "string" }),
    defineField({ name: "protectHeading", title: "Protect heading", type: "text", rows: 2 }),
    defineField({ name: "protectBlurb", title: "Protect blurb", type: "text", rows: 4 }),

    defineField({
      name: "protectionTips",
      title: "Protection tips",
      type: "array",
      of: [
        defineArrayMember({
          name: "protectionTip",
          type: "object",
          fields: [
            defineField({ name: "title", title: "Title", type: "string" }),
            defineField({ name: "text", title: "Text", type: "text", rows: 3 }),
          ],
          preview: { select: { title: "title" } },
        }),
      ],
    }),

    defineField({ name: "bottomLineEyebrow", title: "Bottom line eyebrow", type: "string" }),
    defineField({ name: "bottomLineHeading", title: "Bottom line heading", type: "text", rows: 2 }),
    defineField({ name: "bottomLineBody", title: "Bottom line body", type: "text", rows: 4 }),

    defineField({
      name: "keyFacts",
      title: "Key facts",
      type: "array",
      of: [
        defineArrayMember({
          name: "keyFact",
          type: "object",
          fields: [
            defineField({ name: "label", title: "Label", type: "string" }),
            defineField({ name: "value", title: "Value", type: "string" }),
          ],
          preview: { select: { title: "label", subtitle: "value" } },
        }),
      ],
    }),

    defineField({ name: "guidanceEyebrow", title: "Guidance eyebrow", type: "string" }),
    defineField({ name: "guidanceHeading", title: "Guidance heading", type: "text", rows: 3 }),
    defineField({ name: "guidanceBlurb", title: "Guidance blurb", type: "text", rows: 4 }),

    defineField({
      name: "scopeItems",
      title: "Scope snapshot items",
      type: "array",
      of: [defineArrayMember({ type: "string" })],
    }),

    defineField({ name: "whyItMatters", title: "Why it matters", type: "text", rows: 3 }),

    defineField({
      name: "relatedStories",
      title: "Related stories",
      type: "array",
      of: [
        defineArrayMember({
          name: "relatedStory",
          type: "object",
          fields: [
            defineField({ name: "tag", title: "Tag", type: "string" }),
            defineField({ name: "title", title: "Title", type: "string" }),
            defineField({ name: "time", title: "Read time", type: "string" }),
          ],
          preview: { select: { title: "title", subtitle: "tag" } },
        }),
      ],
    }),

    defineField({ name: "newsletterKicker", title: "Newsletter kicker", type: "string" }),
    defineField({ name: "newsletterHeading", title: "Newsletter heading", type: "text", rows: 2 }),
    defineField({ name: "newsletterBlurb", title: "Newsletter blurb", type: "text", rows: 3 }),

    defineField({
      name: "stats",
      title: "Stat strip",
      type: "array",
      of: [
        defineArrayMember({
          name: "stat",
          type: "object",
          fields: [
            defineField({ name: "k", title: "Label", type: "string" }),
            defineField({ name: "v", title: "Value", type: "string" }),
          ],
          preview: { select: { title: "k", subtitle: "v" } },
        }),
      ],
    }),

    defineField({ name: "footerNote", title: "Footer note", type: "text", rows: 3 }),
  ],
  preview: {
    select: { title: "title", subtitle: "kicker" },
  },
});