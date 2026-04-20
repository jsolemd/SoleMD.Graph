import type { ResourceItem } from "@/features/wiki/module-runtime/types";

export const toolkitCategories: string[] = [
  "Discovery",
  "Extraction",
  "Synthesis",
  "Writing & Citing",
  "Generative Media",
  "Productivity",
];

export const toolkitItems: ResourceItem[] = [
  // --- Discovery ---
  {
    title: "Consensus",
    description:
      "An evidence-based answer engine that uses AI to find and synthesize direct findings from research papers. Searches only academic literature, minimizing hallucinations. The Consensus Meter provides at-a-glance understanding of the evidence landscape.",
    category: "Discovery",
    url: "https://consensus.app",
  },
  {
    title: "Litmaps",
    description:
      "A visual literature discovery tool that creates interactive maps of academic papers to explore connections. Makes it easy to see a research field's structure and history, and monitors the literature for new relevant papers.",
    category: "Discovery",
    url: "https://www.litmaps.com",
  },
  {
    title: "Open Evidence",
    description:
      "A platform designed for the synthesis of clinical evidence. Grounded in top-tier medical journals like NEJM and JAMA. HIPAA compliant and can be used in clinical settings under a BAA. Designed for quick, evidence-based answers on rounds.",
    category: "Discovery",
  },
  {
    title: "Perplexity AI",
    description:
      "A conversational answer engine that combines a large language model with real-time search to provide answers with inline citations. Can narrow searches to specific domains like Academic. User must still critically evaluate the authority of cited websites.",
    category: "Discovery",
    url: "https://www.perplexity.ai",
  },
  {
    title: "Scite.ai",
    description:
      "A citation analysis tool that shows how a research paper has been cited by subsequent publications - supporting, contrasting, or merely mentioning. Goes beyond citation counts to reveal a paper's scientific reception and can vet reference lists for retracted papers.",
    category: "Discovery",
    url: "https://scite.ai",
  },
  {
    title: "Semantic Scholar",
    description:
      "An AI-enhanced academic search engine providing contextually relevant results and TLDR paper summaries. Free to use with AI-powered Research Feeds that keep you current on specific topics.",
    category: "Discovery",
    url: "https://www.semanticscholar.org",
  },
  // --- Extraction ---
  {
    title: "Elicit",
    description:
      "A research assistant that automates parts of the literature review process, especially for systematic reviews. Drastically accelerates systematic reviews and meta-analyses. All extracted data is linked directly to the source quote in the paper.",
    category: "Extraction",
    url: "https://elicit.com",
  },
  {
    title: "NotebookLM",
    description:
      "A research assistant that grounds analysis and answers exclusively in the source documents you provide. Minimal risk of hallucinations with all answers citing exact passages. Enterprise version is HIPAA-compliant. User data is not used for model training.",
    category: "Extraction",
    url: "https://notebooklm.google.com",
  },
  // --- Synthesis ---
  {
    title: "Afforai (Logically.app)",
    description:
      "An integrated research workspace combining literature search, analysis, and writing into a single platform. Allows choice between different LLMs. Strong annotation and team features, though it often requires manual correction of bibliographic data from PDFs.",
    category: "Synthesis",
  },
  {
    title: "General LLMs (Gemini, ChatGPT, Claude)",
    description:
      "Versatile tools capable of drafting, summarizing, brainstorming, and data analysis. Easy-to-use conversational interface and excellent for creative partnership. High risk of hallucination - requires rigorous fact-checking. Standard versions are not HIPAA compliant.",
    category: "Synthesis",
  },
  {
    title: "Mem.ai",
    description:
      "A self-organizing digital notebook that functions as an AI-powered second brain. Automatically links related notes and ideas, with AI chat for querying your entire knowledge base in natural language. Value builds over time as you add more content.",
    category: "Synthesis",
    url: "https://mem.ai",
  },
  // --- Writing & Citing ---
  {
    title: "Jenni AI",
    description:
      "An AI-powered writing partner designed for academic writing. Features integrated citations that build a bibliography as you write, and can use your uploaded PDFs to inform writing suggestions. Academically focused with grounded writing capabilities.",
    category: "Writing & Citing",
    url: "https://jenni.ai",
  },
  {
    title: "Writefull",
    description:
      "An AI-powered academic writing assistant with language models trained on academic texts. Integrates directly into MS Word and Overleaf. Includes specialized tools like Academizer to formalize text. Focuses on prose and grammar rather than scientific content.",
    category: "Writing & Citing",
    url: "https://www.writefull.com",
  },
  // --- Generative Media ---
  {
    title: "Gamma",
    description:
      "An AI presentation generator that creates complete, well-designed slide decks from a text prompt in under a minute. Applies modern visual design principles automatically and can embed web content like videos and dashboards directly.",
    category: "Generative Media",
    url: "https://gamma.app",
  },
  {
    title: "Descript",
    description:
      "An all-in-one audio and video editor that allows you to edit media by editing the text transcript. One-click audio enhancement removes background noise. Automatically detects and removes filler words. Fundamentally changes editing to be document-based, not timeline-based.",
    category: "Generative Media",
    url: "https://www.descript.com",
  },
  {
    title: "Generative Image (Imagen)",
    description:
      "AI image generators that create novel, high-quality images from natural language text prompts. Enables creation of bespoke visuals for presentations, websites, and patient handouts. Prompting is a skill that requires practice to yield desired results.",
    category: "Generative Media",
  },
  {
    title: "Generative Video (Veo, Sora)",
    description:
      "Generates high-definition, coherent video clips from text prompts or still images. Democratizes video creation without a large team or budget. Technology is developing rapidly with the best models still in limited preview.",
    category: "Generative Media",
  },
  {
    title: "Generative Music (Suno, Udio)",
    description:
      "Creates original, royalty-free music including vocals and instrumentation from text prompts. Generates a full, unique song with vocals in minutes. Eliminates music licensing fees and legal complexity. Allows easy experimentation with different genres and moods.",
    category: "Generative Media",
  },
  // --- Productivity ---
  {
    title: "Motion",
    description:
      "An AI-powered project manager and calendar that automatically plans your day based on tasks and priorities. Dynamically reschedules your entire day when conflicts arise. Intelligently blocks out time for deep work on important projects.",
    category: "Productivity",
    url: "https://www.usemotion.com",
  },
  {
    title: "Otter.ai",
    description:
      "An AI meeting assistant that records, transcribes, and summarizes conversations in real time. Identifies key topics and action items automatically. Creates a fully searchable audio and text archive. Requires a Business plan with a BAA for use with PHI.",
    category: "Productivity",
    url: "https://otter.ai",
  },
];
