/**
 * Single source of truth for the course structure and lesson titles.
 * A lesson is published when a matching MDX file exists at src/content/lessons/<module.slug>/<lesson.slug>.mdx;
 * otherwise it shows in the navigation as "coming soon".
 */
export interface Lesson {
  slug: string;
  title: string;
}

export interface Module {
  slug: string;
  number: number;
  title: string;
  summary: string;
  lessons: Lesson[];
}

export const CURRICULUM: Module[] = [
  {
    slug: '01-foundations',
    number: 1,
    title: 'Foundations & Core Abstractions',
    summary:
      'The Spring AI 2.x stack on Java 25 and Boot 4, the ChatClient fluent API, switching providers without code changes, and prompts with images and audio.',
    lessons: [
      { slug: 'spring-ai-2-architecture', title: 'Spring AI 2.x Architecture on Java 25' },
      { slug: 'chatclient-fluent-api', title: 'The ChatClient Fluent API' },
      { slug: 'multi-provider-portability', title: 'Multi-Provider Portability' },
      { slug: 'prompts-and-multimodality', title: 'Prompt Engineering & Multimodality' },
    ],
  },
  {
    slug: '02-structured-outputs',
    number: 2,
    title: 'Deterministic Structured Outputs',
    summary: 'Turning model text into Java records, lists and maps, with provider-native JSON Schema and validation retries.',
    lessons: [
      { slug: 'structured-output-converters', title: 'The StructuredOutputConverter Ecosystem' },
      { slug: 'native-json-schema', title: 'Native JSON Schema & Strict Mode' },
    ],
  },
  {
    slug: '03-advisors-and-memory',
    number: 3,
    title: 'The Advisors API & Chat Memory',
    summary: 'How the advisor chain runs, writing your own advisors, and keeping each user\'s conversation memory separate.',
    lessons: [
      { slug: 'advisor-chain-internals', title: 'Advisor Chain Internals' },
      { slug: 'custom-advisors', title: 'Built-in & Custom Advisors' },
      { slug: 'chat-memory', title: 'Conversation Memory with ChatMemory' },
    ],
  },
  {
    slug: '04-rag-and-etl',
    number: 4,
    title: 'Retrieval-Augmented Generation & ETL',
    summary: 'Loading and chunking documents, embeddings and vector stores, and modular RAG pipelines.',
    lessons: [
      { slug: 'etl-pipeline', title: 'The ETL Pipeline' },
      { slug: 'embeddings-and-vector-stores', title: 'Embeddings & VectorStore' },
      { slug: 'modular-rag', title: 'Modular RAG with RetrievalAugmentationAdvisor' },
    ],
  },
  {
    slug: '05-tools-mcp-agents',
    number: 5,
    title: 'Tool Calling, MCP & Agents',
    summary: 'Letting the model call your Java methods, connecting MCP servers and clients, and agent workflow patterns.',
    lessons: [
      { slug: 'tool-calling', title: 'Tool Calling & ToolCallingAdvisor' },
      { slug: 'model-context-protocol', title: 'Model Context Protocol (MCP)' },
      { slug: 'agentic-workflows', title: 'Agentic Workflows' },
    ],
  },
  {
    slug: '06-production-hardening',
    number: 6,
    title: 'Testing, Evaluation & Production Hardening',
    summary: 'Testcontainers, LLM-as-a-judge evals, tracing and cost tracking, and guardrails.',
    lessons: [
      { slug: 'testcontainers', title: 'Integration Testing with Testcontainers' },
      { slug: 'automated-evals', title: 'Automated AI Evals' },
      { slug: 'observability-and-finops', title: 'Observability & FinOps' },
      { slug: 'security-and-guardrails', title: 'Security & Guardrails' },
    ],
  },
  {
    slug: '07-capstone',
    number: 7,
    title: 'Capstone: Enterprise Support & Knowledge Assistant',
    summary: 'A multi-tenant assistant that brings every module together: ingestion, secure chat, tools, and evaluation.',
    lessons: [
      { slug: 'architecture', title: 'Capstone Architecture' },
      { slug: 'ingestion-pipeline', title: 'Ingestion Pipeline' },
      { slug: 'secure-chat-service', title: 'Secure Chat Service' },
      { slug: 'agentic-tools', title: 'Agentic Tool Execution' },
      { slug: 'observability-and-testing', title: 'Observability & Testing' },
    ],
  },
];

export function lessonId(module: Module, lesson: Lesson): string {
  return `${module.slug}/${lesson.slug}`;
}
