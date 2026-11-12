/** The journal topics. One list for the content schema, the topic pages and the interface strings (topic_<name>). */
export const TOPICS = ["travel", "photography", "projects", "thoughts"] as const;
export type Topic = (typeof TOPICS)[number];
