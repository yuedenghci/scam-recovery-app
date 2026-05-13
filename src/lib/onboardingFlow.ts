export type RightPanelKey =
  | "scamSituation"
  | "scamImpact"
  | "personality"
  | "likedActivities"
  | "expectedRole"
  | "toneStyle"
  | "proactiveLevel"
  | "helpGoals";

export type QuestionNode = {
  id: string;
  section: string;
  prompt: string;
  hintLead?: string;
  hintCards?: string[];
  rightPanelKey: RightPanelKey;
};

export const OPENING_TEXT =
  "嗨，在正式开始之前，我想先简单了解一下你，也想知道你希望我接下来怎样陪伴你支持你。不用一次说得很完整，也没有标准答案。你可以慢慢说。之后我们再进入正式的陪伴过程～";

export const ENDING_TEXT =
  "我先把这些都帮你记在“支持设定”里了。这些不是固定的，后面你想改、想补、或者发现自己真正需要的不是这个，都可以随时修改。请查看。";

export const RIGHT_PANEL_MODULES: Array<{
  key: RightPanelKey;
  title: string;
  group: "关于用户" | "关于 AI";
}> = [
  { key: "scamSituation", title: "诈骗情况", group: "关于用户" },
  { key: "scamImpact", title: "诈骗影响", group: "关于用户" },
  { key: "personality", title: "用户性格", group: "关于用户" },
  { key: "likedActivities", title: "让用户放松的活动", group: "关于用户" },
  { key: "expectedRole", title: "你希望我像谁", group: "关于 AI" },
  { key: "toneStyle", title: "你希望我怎么和你说话", group: "关于 AI" },
  { key: "proactiveLevel", title: "你希望我的主动程度是怎样的", group: "关于 AI" },
  { key: "helpGoals", title: "你希望我帮助你什么", group: "关于 AI" },
];

export const QUESTIONS: QuestionNode[] = [
  {
    id: "q1-scam",
    section: "Part 1",
    prompt:
      "可以先和我说说，这件事大概是怎么发生的吗？不用讲得特别完整，先说你觉得重要的部分就好。",
    rightPanelKey: "scamSituation",
  },
  {
    id: "q2-impact-near",
    section: "Part 2",
    prompt:
      "谢谢你告诉我这些。这件事是什么时候发生的呢？它现在还会怎样影响你呢？",
    rightPanelKey: "scamImpact",
  },
  {
    id: "q3-impact-main",
    section: "Part 2",
    prompt: "那现在最困扰你的是什么呢？主要从心理方面（比如自责）和日常生活方面（比如睡眠不好）来说的话。",
    rightPanelKey: "scamImpact",
  },
  {
    id: "q4-personality",
    section: "Part 3",
    prompt:
      "除了诈骗这件事，我也想更了解你。你会怎么形容自己呢？比如比较敏感、内向、容易多想，或者大大咧咧。你觉得自己更像什么样的人呢？",
    rightPanelKey: "personality",
  },
  {
    id: "q5-activity",
    section: "Part 4",
    prompt:
      "那平时有没有什么事，能让你稍微平静、放松，或者心情好一点？比如看书、运动、听歌、散步，或者别的什么。",
    rightPanelKey: "likedActivities",
  },
  {
    id: "q6-role-core",
    section: "Part 5",
    prompt:
      "好的～我不仅希望了解你，我更想成为你心里期待的那个我。你会希望我像什么样的存在呢？",
    hintLead:
      "这些词只是辅助你想一想，你完全可以用自己的话来描述，说得更具体更贴切一些哦",
    hintCards: ["朋友", "另一个自己", "树洞"],
    rightPanelKey: "expectedRole",
  },
  {
    id: "q7-role-background",
    section: "Part 5",
    prompt:
      "你会希望我有自己的人生故事吗？比如一个经历过类似事情的人，一个内心更稳定、成长后的的你自己，那个骗了你的骗子，或者其他你心里想象中的特定对象等等。\n\n你可以自由发挥，不要局限在我给你的例子里。请注意要和上一题你的答案对应起来，不要出现前后矛盾的情况哦",
    rightPanelKey: "expectedRole",
  },
  {
    id: "q8-role-feeling",
    section: "Part 5",
    prompt:
      "那对于我们之间，你会希望我怎么对待你呢？比如让你感觉被重视、不过分亲密、一直站在你这边等等。\n\n你可以自由发挥，不要局限在我给你的例子里。请注意要和上两题你的回答对应起来，不要出现前后矛盾的情况哦",
    rightPanelKey: "expectedRole",
  },
  {
    id: "q9-tone-style",
    section: "Part 6",
    prompt:
      "你会更喜欢我怎么和你说话呢？",
    hintLead:
      "这些词只是辅助你想一想，你完全可以用自己的话来描述，说得更具体更贴切一些哦",
    hintCards: ["温柔的", "幽默的", "毒舌的"],
    rightPanelKey: "toneStyle",
  },
  {
    id: "q10-tone-framework",
    section: "Part 6",
    prompt:
      "如果我陪你时会带一些自己的理解方式，你会更喜欢我偏哪一种呢？比如更心理学一点、更哲学一点，或者其他你熟悉的理解方式。",
    hintLead:
      "这些词只是辅助你想一想，你完全可以用自己的话来描述，说得更具体更贴切一些哦",
    hintCards: ["心理学", "哲学", "佛学"],
    rightPanelKey: "toneStyle",
  },
  {
    id: "q11-tone-avoid",
    section: "Part 6",
    prompt:
      "有没有什么说话方式，是你特别不想要的？想到什么都可以直接说。",
    hintLead:
      "这些词只是辅助你想一想，你完全可以用自己的话来描述，说得更具体更贴切一些哦",
    hintCards: ["不要总是顺着我", "不要问太细", "不要一上来就讲道理"],
    rightPanelKey: "toneStyle",
  },
  {
    id: "q12-proactive-contact",
    section: "Part 7",
    prompt:
      "我还想了解一下“主动”这件事。当你没有主动和我聊天的时候，你希望我主动和你聊天吗？比如我只在你来找我时回应，或者我偶尔主动先给你发消息。",
    rightPanelKey: "proactiveLevel",
  },
  {
    id: "q13-proactive-guide",
    section: "Part 7",
    prompt:
      "你希望我们聊天的时候我要不要多引导你一些？",
    hintLead:
      "这些词只是辅助你想一想，你完全可以用自己的话来描述，说得更具体更贴切一些哦",
    hintCards: [
      "只能等我自己主动说",
      "可以轻轻追问我，帮助我说清楚",
      "可以指出我没提到但可能重要的感受或问题",
      "可以根据我的喜好，主动和我聊一些事",
    ],
    rightPanelKey: "proactiveLevel",
  },
  {
    id: "q14-help-goals",
    section: "Part 8",
    prompt:
      "最后一个问题。你最希望我主要帮你什么？",
    hintLead:
      "这些词只是辅助你想一想，你完全可以用自己的话来描述，说得更具体更贴切一些哦",
    hintCards: [
      "情绪承接：接住我、理解我、安抚我",
      "情绪宣泄：陪我吐槽、把气说出来",
      "认知整理：帮我把事情理清、慢慢复盘",
      "意义整理：帮我看见一些对自己有用的理解",
      "风险提醒：提醒我可能的二次诈骗风险",
      "注意力转移：当我太陷进去时，提醒我换个角度或先做点别的",
    ],
    rightPanelKey: "helpGoals",
  },
];

export function getQuestionById(id: string): QuestionNode | undefined {
  return QUESTIONS.find((q) => q.id === id);
}

export function questionTargetsProactiveLevel(questionId: string): boolean {
  const q = getQuestionById(questionId);
  return q?.rightPanelKey === "proactiveLevel";
}

export function getModuleTitle(key: RightPanelKey): string {
  return RIGHT_PANEL_MODULES.find((m) => m.key === key)?.title ?? key;
}
