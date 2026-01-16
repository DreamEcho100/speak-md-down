import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
} from "solid-js";

import { Dynamic } from "solid-js/web";

/* ============================================================================
 * MARKDOWN PARSING UTILITIES
 * ============================================================================
 *
 * This section contains all markdown parsing and HTML conversion logic.
 *
 * TO EXTEND OR IMPROVE:
 *
 * 1. ADD NEW BLOCK TYPES:
 *    - Add new type to MdBlock typedef (e.g., "table" | "image")
 *    - Handle parsing in parseMarkdown() function
 *    - Add HTML conversion in blocksToHTML() function
 *    - Add rendering in component's markdown view (optional)
 *
 * 2. IMPROVE PARSING:
 *    - Current parser is line-based and simple
 *    - For advanced features (inline styles, links, images), consider:
 *      * Using a library like 'marked' or 'markdown-it'
 *      * Implementing inline parsing (bold, italic, links)
 *      * Adding multi-line block support (better list grouping)
 *
 * 3. ENHANCE HTML OUTPUT:
 *    - Add CSS classes for better styling
 *    - Support nested lists
 *    - Add syntax highlighting for code blocks
 *    - Convert markdown links to HTML <a> tags
 *
 * 4. CURRENT USAGE IN COMPONENT:
 *    - parseMarkdown() is called in loadFile() to convert text to blocks
 *    - blocksToHTML() is called in the HTML view to render converted content
 *    - Blocks are stored in state and used for both TTS and display
 *    - Each block has a data-block-index for highlighting during TTS
 *
 * ============================================================================
 */

/**
 * Represents a parsed markdown block.
 *
 * @typedef {Object} MdBlock
 * @property {"heading" | "paragraph" | "list" | "code" | "blockquote"} type - The type of markdown block
 * @property {string} text - The text content of the block
 * @property {string} src - Original source text of the block (optional)
 * @property {number} [level] - For headings: the heading level (1-6)
 * @property {boolean} [ordered] - For lists: whether it's an ordered list
 */

/**
 * Parse markdown text into structured blocks.
 *
 * This is a simple, line-based parser that handles basic markdown elements.
 * It processes the markdown sequentially and groups related lines into blocks.
 *
 * LIMITATIONS:
 * - No inline markdown (bold, italic, links, inline code)
 * - No nested lists
 * - No tables, images, or horizontal rules
 * - Code blocks must use ``` fences
 *
 * FUTURE IMPROVEMENTS:
 * - Add inline markdown parsing with regex
 * - Support GFM (GitHub Flavored Markdown) tables
 * - Handle nested block structures
 * - Add image and link extraction
 * - Preserve list hierarchy
 *
 * @param {string} md - Raw markdown text
 * @returns {MdBlock[]} Array of parsed markdown blocks
 *
 * @example
 * const blocks = parseMarkdown("# Hello\n\nThis is a paragraph.");
 * // Returns: [
 * //   { type: "heading", text: "Hello", level: 1, src: "# Hello" },
 * //   { type: "paragraph", text: "This is a paragraph.", src: "This is a paragraph." }
 * // ]
 */
function parseMarkdown(md) {
  const lines = md.split("\n");
  /** @type {MdBlock[]} */
  const blocks = [];
  /** @type {string[]} */
  const buffer = [];
  /** @type {string[]} */
  const codeBuffer = [];
  let inCodeBlock = false;
  let codeLanguage = "";

  /**
   * Flush accumulated paragraph lines into a single block.
   * Joins lines with spaces to create continuous text.
   */
  function flushParagraph() {
    if (buffer.length) {
      blocks.push({
        type: "paragraph",
        text: buffer.join(" "),
        src: buffer.join("\n"),
      });
      buffer.length = 0;
    }
  }

  /**
   * Flush accumulated code block lines into a single block.
   * Preserves line breaks and indentation.
   */
  function flushCodeBlock() {
    if (codeBuffer.length) {
      blocks.push({
        type: "code",
        text: codeBuffer.join("\n"),
        src: codeBuffer.join("\n"),
      });
      codeBuffer.length = 0;
      codeLanguage = "";
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Handle code block fences (```)
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        flushParagraph();
        inCodeBlock = true;
        // Extract language hint (e.g., ```javascript)
        codeLanguage = trimmed.slice(3).trim();
      }
      continue;
    }

    // Accumulate code block content
    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Empty lines flush the current paragraph
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    // Parse headings (# to ######)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      blocks.push({
        type: "heading",
        text: headingMatch[2],
        level: headingMatch[1].length,
        src: trimmed,
      });
      continue;
    }

    // Parse blockquotes (> text)
    if (trimmed.startsWith("> ")) {
      flushParagraph();
      blocks.push({
        type: "blockquote",
        text: trimmed.replace(/^>\s*/, ""),
        src: trimmed,
      });
      continue;
    }

    // Parse lists (unordered: - or *, ordered: 1. 2. etc.)
    const unorderedListMatch = trimmed.match(/^[-*]\s+(.+)$/);
    const orderedListMatch = trimmed.match(/^\d+\.\s+(.+)$/);

    if (unorderedListMatch || orderedListMatch) {
      flushParagraph();
      blocks.push({
        type: "list",
        text: unorderedListMatch?.[1] || orderedListMatch?.[1] || "",
        ordered: !!orderedListMatch,
        src: trimmed,
      });
      continue;
    }

    // Accumulate regular text into paragraph buffer
    buffer.push(trimmed);
  }

  // Flush any remaining content
  flushParagraph();
  flushCodeBlock();

  console.log("📦 Parsed markdown into", blocks.length, "blocks");
  return blocks;
}

/**
 * @param {Object} props
 * @param {MdBlock[]} props.blocks
 * @param {number} props.currentIndex
 * @param {(index: number) => void} props.setCurrentIndex
 * @param {(index: number) => void} props.speak
 */
function BlocksToHTML(props) {
  //   return blocks
  //     .map((block, i) => {
  //       const dataAttr = `data-block-index="${i}"`;

  //       switch (block.type) {
  //         case "heading": {
  //           const level = block.level || 1;
  //           return `<h${level} ${dataAttr} class="heading-${level}">${escapeHTML(
  //             block.text
  //           )}</h${level}>`;
  //         }

  //         case "paragraph":
  //           return `<p ${dataAttr} class="paragraph">${escapeHTML(
  //             block.text
  //           )}</p>`;

  //         case "list": {
  //           // NOTE: Currently renders individual <li> without parent <ul>/<ol>
  //           // Future: Group consecutive list items and wrap them properly
  //           const listType = block.ordered ? "ol" : "ul";
  //           return `<li ${dataAttr} class="list-item" data-list-type="${listType}">${escapeHTML(
  //             block.text
  //           )}</li>`;
  //         }

  //         case "code": {
  //           // NOTE: Could add syntax highlighting here in the future
  //           // Example: Use Prism.js or highlight.js with language from codeLanguage
  //           return `<pre ${dataAttr} class="code-block"><code>${escapeHTML(
  //             block.text
  //           )}</code></pre>`;
  //         }

  //         case "blockquote":
  //           return `<blockquote ${dataAttr} class="blockquote">${escapeHTML(
  //             block.text
  //           )}</blockquote>`;

  //         default:
  //           return `<div ${dataAttr}>${escapeHTML(block.text)}</div>`;
  //       }
  //     })
  //     .join("\n");
  return (
    // biome-ignore lint/a11y/useSemanticElements: <explanation>
    <div class="space-y-3" role="list">
      <For each={props.blocks}>
        {(block, i) => {
          return (
            // biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: <explanation>
            // biome-ignore lint/a11y/useSemanticElements: <explanation>
            <button
              type="button"
              onClick={() => {
                console.log("🖱️ Block clicked:", i());
                stop();
                props.setCurrentIndex(i());
                props.speak(i());
              }}
              class={`w-full text-left px-6 py-4 rounded-xl transition-all duration-200 border-2
                        ${
                          i() === props.currentIndex
                            ? "bg-cyan-500/20 border-cyan-500 shadow-lg shadow-cyan-500/20"
                            : "bg-slate-800/50 border-slate-700 hover:border-slate-600 hover:bg-slate-800"
                        }`}
              role="listitem"
              aria-current={i() === props.currentIndex ? "true" : undefined}
              aria-label={`${block.type} block ${i() + 1} of ${
                props.blocks.length
              }`}
            >
              <Switch>
                <Match when={block.type === "heading" && block}>
                  {(block) => {
                    const Tag = `h${block().level}`;
                    return (
                      <Dynamic
                        component={Tag}
                        data-block-index={i()}
                        class={`font-bold text-cyan-400 my-4 ${
                          block().level === 1
                            ? "text-3xl"
                            : block().level === 2
                            ? "text-2xl"
                            : block().level === 3
                            ? "text-xl"
                            : "text-lg"
                        }`}
                      >
                        {block().text}
                      </Dynamic>
                    );
                  }}
                </Match>
                <Match when={block.type === "paragraph" && block}>
                  {(block) => (
                    <p
                      data-block-index={i()}
                      class="text-slate-300 leading-relaxed my-2"
                    >
                      {block().text}
                    </p>
                  )}
                </Match>
                <Match when={block.type === "list" && block}>
                  {(block) => (
                    <li
                      data-block-index={i()}
                      class="text-slate-300 ml-6 list-disc marker:text-cyan-400 my-1"
                    >
                      {block().text}
                    </li>
                  )}
                </Match>
                <Match when={block.type === "code" && block}>
                  {(block) => (
                    <pre
                      data-block-index={i()}
                      class="text-sm bg-slate-900/50 p-4 rounded-lg overflow-x-auto my-2"
                    >
                      <code class="text-green-400">{block().text}</code>
                    </pre>
                  )}
                </Match>
                <Match when={block.type === "blockquote" && block}>
                  {(block) => (
                    <blockquote
                      data-block-index={i()}
                      class="border-l-4 border-cyan-500 pl-4 italic text-slate-300 my-2"
                    >
                      {block().text}
                    </blockquote>
                  )}
                </Match>
              </Switch>
            </button>
          );
        }}
      </For>
    </div>
  );
}

/**
 * Escape HTML special characters to prevent XSS.
 *
 * Uses browser's built-in textContent escaping for safety.
 * This prevents malicious HTML in markdown from executing.
 *
 * @param {string} text - Text to escape
 * @returns {string} HTML-safe text
 *
 * @example
 * escapeHTML('<script>alert("xss")</script>')
 * // Returns: '&lt;script&gt;alert("xss")&lt;/script&gt;'
 */
function escapeHTML(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/* ============================================================================
 * END OF MARKDOWN UTILITIES
 *
 * To move these to a separate file:
 *
 * 1. Create a new file: markdownUtils.js
 * 2. Copy the entire section above (including JSDoc comments)
 * 3. Export the functions:
 *    export { parseMarkdown, blocksToHTML, escapeHTML };
 * 4. Import in this component:
 *    import { parseMarkdown, blocksToHTML } from './markdownUtils.js';
 *
 * Note: The MdBlock typedef should be exported/imported as well for typing.
 * ============================================================================
 */

/**
 * Markdown Reader Component with HTML View and Text-to-Speech.
 *
 * COMPONENT ARCHITECTURE:
 * - Loads markdown files and parses them into blocks
 * - Provides TTS playback with visual highlighting
 * - Offers two view modes: markdown blocks and HTML preview
 * - Synchronizes TTS with visual highlighting using block indices
 *
 * @returns {import('solid-js').JSX.Element}
 */

export default function MarkdownReader() {
  const synth = window.speechSynthesis;
  /** @type {HTMLDivElement|undefined} */
  let articleEl;

  // Markdown textarea state (source of truth)
  const [markdown, setMarkdown] = createSignal("");
  // Parsed blocks from markdown
  const [blocks, setBlocks] = createSignal(/** @type {MdBlock[]} */ ([]));
  const [currentIndex, setCurrentIndex] = createSignal(0);
  //   const [isPlaying, setIsPlaying] = createSignal(false);
  //   const [isPaused, setIsPaused] = createSignal(false); // NEW: Track paused state
  const [playState, setPlayState] = createSignal(
    /** @type {'playing' | 'stopped'} */ ("stopped")
  );
  const [rate, setRate] = createSignal(1);
  const [pitch, setPitch] = createSignal(1);
  const [voices, setVoices] = createSignal(
    /** @type {SpeechSynthesisVoice[]} */ ([])
  );
  const [voice, setVoice] = createSignal(
    /** @type {SpeechSynthesisVoice | null} */ (null)
  );
  const isAtFirstBlock = createMemo(() => currentIndex() === 0);

  // Flag to track if playback should continue
  let shouldContinue = true;

  /* ---------- Chrome-safe voice loading ---------- */
  /**
   * Load available speech synthesis voices.
   * Uses multiple retry attempts for Chrome compatibility.
   */
  function loadVoices() {
    console.log("🔍 loadVoices() called");
    const v = synth.getVoices();
    console.log("📋 getVoices() returned:", v.length, "voices");

    if (v.length) {
      console.log("✅ First voice:", v[0]?.name);
      setVoices(v.sort((a, b) => a.name.localeCompare(b.name)));
      if (!voice()) {
        const defaultVoice = v.find((x) => x.default) || v[0];
        console.log("🎤 Setting default voice:", defaultVoice?.name);
        setVoice(defaultVoice);
      }
    }
  }

  createEffect(() => {
    console.log("🎬 Voice loading effect triggered");
    loadVoices();

    /** @type {number | null} */
    let timeout100 = null;
    /** @type {number | null} */
    let timeout500 = null;
    const voicesChangedHandler = () => {
      console.log("🔔 voiceschanged event fired!");
      loadVoices();

      timeout100 = setTimeout(() => {
        if (synth.getVoices().length === 0) {
          console.log("⏳ Retrying voice load after 100ms");
          loadVoices();
        }
      }, 100);

      timeout500 = setTimeout(() => {
        if (synth.getVoices().length === 0) {
          console.log("⏳ Retrying voice load after 500ms");
          loadVoices();
        }
      }, 500);
    };
    synth.onvoiceschanged = voicesChangedHandler;

    onCleanup(() => {
      // Remove event handler
      if (synth.onvoiceschanged === voicesChangedHandler) {
        synth.onvoiceschanged = null;
      }
      // Clear timeouts
      if (timeout100) clearTimeout(timeout100);
      if (timeout500) clearTimeout(timeout500);
    });
  });

  /* ---------- core speech ---------- */

  /**
   * Auto-scroll highlighted block into view when index changes.
   * Only applies in HTML view mode.
   * @param {number} i - Block index to scroll to
   */
  //   function scrollToCurrentBlockIfNotInView(i) {
  //     console.log("🔍 scrollToCurrentBlock() called for index:", i);
  //     const blockEl = document.querySelector(`[data-block-index="${i}"]`);
  //     if (!blockEl) {
  //       console.warn("⚠️ No block element found for index:", i);
  //       return;
  //     }

  //     blockEl.scrollIntoView({ behavior: "smooth", block: "center" });
  //     console.log("✅ Scrolled to block element:", blockEl);
  //   }
  //   function scrollToCurrentBlockIfNotInView(i) {
  //     console.log("🔍 scrollToCurrentBlock() called for index:", i);
  //     const blockEl = document.querySelector(`[data-block-index="${i}"]`);
  //     if (!blockEl || !(blockEl instanceof HTMLElement)) {
  //       console.warn("⚠️ No block element found for index:", i);
  //       return;
  //     }

  //     // Get the scrollable parent (or use the element's offsetParent)
  //     const scrollParent = blockEl.offsetParent || blockEl.parentElement;
  //     if (!scrollParent || !(scrollParent instanceof HTMLElement)) {
  //       console.warn("⚠️ No scrollable parent found for block index:", i);
  //       return;
  //     }

  //     // Get block position relative to parent
  //     const blockRect = blockEl.getBoundingClientRect();
  //     const parentRect = scrollParent.getBoundingClientRect();

  //     // Calculate how much of the block is visible
  //     const visibleTop = Math.max(blockRect.top, parentRect.top);
  //     const visibleBottom = Math.min(blockRect.bottom, parentRect.bottom);
  //     const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  //     const blockHeight = blockRect.height;

  //     // Calculate percentage visible
  //     const percentVisible = (visibleHeight / blockHeight) * 100;

  //     console.log(`📊 Block visibility: ${percentVisible.toFixed(1)}%`);

  //     // Only scroll if less than 50% is visible
  //     if (percentVisible < 50) {
  //       blockEl.scrollIntoView({ behavior: "smooth", block: "center" });
  //       console.log("✅ Scrolled to block element (was mostly hidden)");
  //     } else {
  //       console.log("⏭️ Block already sufficiently visible, skipping scroll");
  //     }
  //   }
  /**
   * Auto-scroll highlighted block into view when index changes.
   * Only scrolls if most of the block (>50%) is outside the visible area.
   * Only applies in HTML view mode.
   * @param {number} i - Block index to scroll to
   */
  function scrollToCurrentBlockIfNotInView(i) {
    console.log("🔍 scrollToCurrentBlock() called for index:", i);
    const blockEl = document.querySelector(`[data-block-index="${i}"]`);
    if (!blockEl || !(blockEl instanceof HTMLElement)) {
      console.warn("⚠️ No block element found for index:", i);
      return;
    }

    // Use articleEl as the scrollable parent container
    const scrollParent = articleEl;
    if (!scrollParent || !(scrollParent instanceof HTMLElement)) {
      console.warn("⚠️ No articleEl found for scrolling");
      return;
    }

    // Check if at least 30% of articleEl is visible in viewport
    const parentRect = scrollParent.getBoundingClientRect();
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight;
    const visibleParentTop = Math.max(parentRect.top, 0);
    const visibleParentBottom = Math.min(parentRect.bottom, viewportHeight);
    const visibleParentHeight = Math.max(
      0,
      visibleParentBottom - visibleParentTop
    );
    const parentHeight = parentRect.height;
    const parentPercentVisible = (visibleParentHeight / parentHeight) * 100;

    console.log(`📊 articleEl visibility: ${parentPercentVisible.toFixed(1)}%`);
    if (parentPercentVisible < 30) {
      console.log("⏭️ articleEl is mostly out of view, skipping block scroll");
      return;
    }

    // Synchronous visibility check using getBoundingClientRect
    const blockRect = blockEl.getBoundingClientRect();

    const visibleTop = Math.max(blockRect.top, parentRect.top);
    const visibleBottom = Math.min(blockRect.bottom, parentRect.bottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    const blockHeight = blockRect.height;
    const percentVisible = (visibleHeight / blockHeight) * 100;

    console.log(`📊 Block visibility: ${percentVisible.toFixed(1)}%`);
    // Only scroll if less than 50% is visible
    if (percentVisible < 50) {
      blockEl.scrollIntoView({ behavior: "smooth", block: "center" });
      console.log("✅ Scrolled to block element (was mostly hidden)");
    } else {
      console.log("⏭️ Block already sufficiently visible, skipping scroll");
    }
  }

  /**
   * Speak a single block and continue to the next if shouldContinue is true.
   *
   * @param {MdBlock[]} list - List of blocks to speak
   * @param {number} i - Current block index
   */
  function speakBlock(list, i) {
    scrollToCurrentBlockIfNotInView(i);
    console.log("🗣️ speakBlock called for index:", i);

    if (i >= list.length) {
      console.log("✅ Finished speaking all blocks");
      setPlayState("stopped");
      shouldContinue = false;
      return;
    }

    const u = new SpeechSynthesisUtterance(list[i].text);
    console.log(
      "📝 Created utterance for:",
      `${list[i].text.substring(0, 50)}...`
    );

    u.rate = rate();
    u.pitch = pitch();
    const currentVoice = voice();
    if (currentVoice) {
      u.voice = currentVoice;
      console.log("🎤 Using voice:", currentVoice.name);
    } else {
      console.warn("⚠️ No voice selected!");
    }

    u.onstart = () => {
      console.log("▶️ Started speaking block", i);
      setCurrentIndex(i);
    };

    u.onend = () => {
      console.log("⏹️ Finished speaking block", i);
      // Only continue if we haven't been stopped/paused
      if (shouldContinue) {
        speakBlock(list, i + 1);
      }
    };

    u.onerror = (e) => {
      console.error("❌ Speech error on block", i);
      console.error("Error details:", {
        error: e.error,
        message:
          "message" in e && typeof e.message === "string" ? e.message : e,
        charIndex: e.charIndex,
        elapsedTime: e.elapsedTime,
      });
      synth.cancel();
      setPlayState("stopped");
      shouldContinue = false;
    };

    console.log("📢 Calling synth.speak()");
    synth.speak(u);
    console.log(
      "✓ synth.speak() called - speaking:",
      synth.speaking,
      "pending:",
      synth.pending
    );
  }
  /**
   * Start speaking from a specific block index.
   * Recursively speaks each block until the end or until stopped.
   *
   * @param {MdBlock[]} list - List of blocks to speak
   * @param {number} i - Block index to start from
   */
  function speakFrom(list, i) {
    console.log("🎯 speakFrom called with index:", i);
    console.log("📚 Total blocks:", blocks().length);

    if (!blocks().length) {
      console.warn("⚠️ No blocks to speak");
      return;
    }

    console.log("🛑 Cancelling previous speech");
    synth.cancel();
    shouldContinue = true; // Reset flag when starting new playback
    setPlayState("playing");
    setCurrentIndex(i);

    speakBlock(list, i);
  }

  /* ---------- public speak API ---------- */
  /**
   * Start or restart speech from current or specified index.
   *
   * @param {number} [i] - Optional index to speak from
   */
  function speak(i = currentIndex()) {
    console.log("🎤 speak() called with index:", i);
    const list = blocks();
    speakFrom(list, i);
  }

  /* ---------- transport controls ---------- */

  /**
   * PLAY: Start speaking from current position
   * - If not playing and not paused: starts from current block
   * - Does nothing if already playing
   */
  function play() {
    if (playState() === "playing") {
      console.log("▶️ Play clicked but already playing, ignoring");
      return;
    }

    console.log("▶️ Play clicked");
    if (playState() !== "playing") {
      speak();
    }
    setPlayState("playing");
    shouldContinue = true; // Allow advancing to next blocks
  }

  /**
   * RESUME: Continue from where pause stopped
   * - Only works if currently paused
   * - Continues speaking the same utterance from where it was paused
   * - Re-enables advancing to next blocks
   */
  function resume() {
    if (playState() !== "stopped") {
      console.log("⏯️ Resume clicked but not paused, ignoring");
      return;
    }

    shouldContinue = true; // Allow advancing to next blocks again
    setPlayState("playing");
    console.log("⏯️ Resume clicked");
    if (synth.paused) {
      synth.resume();
      console.log("⏯️ Speech resumed");
    } else {
      // play if not paused
      speak();
    }
  }

  function playResumeOrPause() {
    if (playState() === "playing") {
      stop();
    } else if (playState() === "stopped") {
      if (isAtFirstBlock()) {
        play();
      } else {
        resume();
      }
    }
  }

  /**
   * STOP: Completely halt and reset
   * - Cancels all speech immediately
   * - Resets to beginning (does NOT change currentIndex)
   * - Clears paused state
   * - To restart: user must click Play again
   */
  function stop() {
    if (playState() === "stopped") {
      console.log("⏹️ Stop clicked but already stopped, ignoring");
      return;
    }

    console.log("⏹️ Stop clicked");
    synth.cancel();
    console.log("⏹️ Speech stopped");
    shouldContinue = false; // Don't advance to next block
    setPlayState("stopped");
  }

  /**
   * NEXT: Jump to next block and start speaking
   * - Moves to next block
   * - Starts speaking immediately
   */
  function next() {
    console.log("⏭️ Next clicked");
    const nextIndex = Math.min(currentIndex() + 1, blocks().length - 1);
    speak(nextIndex);
  }

  /**
   * PREV: Jump to previous block and start speaking
   * - Moves to previous block
   * - Starts speaking immediately
   */
  function prev() {
    console.log("⏮️ Prev clicked");
    const prevIndex = Math.max(currentIndex() - 1, 0);
    speak(prevIndex);
  }

  /* ---------- file loading ---------- */
  /**
   * Load and parse a markdown file.
   *
   * @param {File} file - The markdown file to load
   */
  async function loadFile(file) {
    console.log("📁 loadFile called");

    if (!(file instanceof File)) {
      console.error("❌ Not a valid file:", file);
      return;
    }

    console.log("📄 File info:", {
      name: file.name,
      size: file.size,
      type: file.type,
    });

    try {
      const text = await file.text();
      console.log("📖 File text loaded, length:", text.length);
      stop();
      setMarkdown(text); // Set textarea content
      // Parsing will be triggered by effect below
      synth.cancel();
      setCurrentIndex(0);
      setPlayState("stopped");
      console.log("✅ File loaded successfully");
    } catch (error) {
      console.error("❌ Error loading file:", error);
    }
  }

  // Parse markdown whenever textarea changes
  createEffect(() => {
    const md = markdown();
    const parsed = parseMarkdown(md);
    setBlocks(parsed);
  });

  /* ---------- utility functions ---------- */
  // Generate a color from the voice name (hash to hex)
  /** @param {string} str  */
  function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = "#";
    for (let i = 0; i < 3; i++) {
      const value = (hash >> (i * 8)) & 0xff;
      color += ("00" + value.toString(16)).slice(-2);
    }
    return color;
  }

  // Calculate contrast color (black or white) for background
  /** @param {string} hexcolor  */
  function getContrastYIQ(hexcolor) {
    hexcolor = hexcolor.replace("#", "");
    const r = parseInt(hexcolor.substr(0, 2), 16);
    const g = parseInt(hexcolor.substr(2, 2), 16);
    const b = parseInt(hexcolor.substr(4, 2), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? "#222" : "#fff";
  }

  // Dynamic font size based on character length
  /** @param {string} text  */
  const getFontSize = (text) => {
    const length = text.length;
    if (length <= 2) return "text-[10px]";
    if (length === 3) return "text-[8px]";
    return "text-[7px]";
  };

  /* ---------- cleanup ---------- */
  onCleanup(() => {
    console.log(
      "🧹 Cleaning up - cancelling speech and removing event listeners"
    );
    synth.cancel();
    // Remove any event listeners or async resources if needed
    synth.onvoiceschanged = null;
  });

  return (
    <div class="grow bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white w-full flex flex-col justify-start items-center">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 space-y-8 lg:space-y-10">
        {/* Header */}
        <header class="text-center space-y-3 px-4">
          <h1 class="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            Markdown Speech Reader
          </h1>
          <p class="text-slate-400 text-base sm:text-lg">
            Edit markdown in the textarea or upload a file, then preview and
            listen with highlighting
          </p>
        </header>

        {/* Markdown Editor Section */}
        <section
          class="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-xl"
          aria-label="Markdown editor"
        >
          <label class="block w-full">
            <span class="text-sm font-medium text-slate-300 mb-3 block">
              Markdown Editor
            </span>
            <textarea
              value={markdown()}
              onInput={(e) => {
                stop();
                setMarkdown(e.target.value);
              }}
              rows={12}
              placeholder="Type or paste markdown here..."
              class="block w-full font-mono text-base bg-slate-900 text-slate-100 border border-slate-700 rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all resize-vertical min-h-[200px]"
              aria-label="Markdown editor textarea"
            />
          </label>
          <div class="mt-4 flex items-center gap-4">
            <label class="block">
              <span class="text-xs font-medium text-slate-400 mb-1 block">
                Or load from file
              </span>
              <input
                type="file"
                accept=".md,.markdown,.txt"
                onChange={(e) => {
                  const target = e.target;
                  if (!(target instanceof HTMLInputElement)) return;
                  const file = target.files?.[0];
                  if (!file) return;
                  loadFile(file);
                  target.value = "";
                }}
                class="block text-sm text-slate-400
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-gradient-to-r file:from-cyan-500 file:to-blue-600
                  file:text-white
                  file:cursor-pointer file:transition-all file:duration-200
                  hover:file:from-cyan-400 hover:file:to-blue-500
                  cursor-pointer"
                aria-label="Upload markdown file"
              />
            </label>
          </div>
        </section>

        {/* Playback Controls */}
        <section
          class="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6"
          aria-label="Playback controls"
        >
          <h2 class="text-xl font-semibold text-slate-200 mb-4">
            Playback Controls
          </h2>

          <div class="flex flex-wrap gap-3">
            {
              /**
               * Combined Play/Resume button
               *
               * - If currently paused, shows "Resume" state
               * - If stopped or not playing, shows "Play" state
               */
              <button
                type="button"
                onClick={playResumeOrPause}
                disabled={blocks().length === 0}
                class={`px-4 sm:px-6 py-3 bg-gradient-to-r transition-all duration-200
                      shadow-lg hover:shadow-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed
                      flex items-center gap-2 text-sm sm:text-base rounded-lg ${
                        playState() === "playing"
                          ? "from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400"
                          : "from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500"
                      }`}
                aria-label={
                  isAtFirstBlock() && playState() === "stopped"
                    ? "Play"
                    : playState() === "playing"
                    ? "Pause"
                    : "Resume"
                }
              >
                <span aria-hidden="true">
                  {isAtFirstBlock() && playState() === "stopped"
                    ? "▶"
                    : playState() === "playing"
                    ? "⏸"
                    : "⏯"}
                </span>
                {isAtFirstBlock() && playState() === "stopped"
                  ? "Play"
                  : playState() === "playing"
                  ? "Pause"
                  : "Resume"}
              </button>
            }

            <button
              type="button"
              onClick={() => {
                setCurrentIndex(0);
                play();
              }}
              disabled={blocks().length === 0}
              class="px-4 sm:px-6 py-3 bg-gradient-to-r from-red-500 to-pink-500 rounded-lg font-medium
              hover:from-red-400 hover:to-pink-400 transition-all duration-200
              shadow-lg hover:shadow-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-2 text-sm sm:text-base"
              aria-label="Reset"
            >
              <span aria-hidden="true">⭯</span> Reset
            </button>

            <button
              type="button"
              onClick={prev}
              disabled={currentIndex() === 0}
              class="px-4 sm:px-6 py-3 bg-slate-700 rounded-lg font-medium
                hover:bg-slate-600 transition-all duration-200
                disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center gap-2 text-sm sm:text-base"
              aria-label="Previous block"
            >
              <span aria-hidden="true">⏮</span> Previous
            </button>

            <button
              type="button"
              onClick={next}
              disabled={currentIndex() >= blocks().length - 1}
              class="px-4 sm:px-6 py-3 bg-slate-700 rounded-lg font-medium
                hover:bg-slate-600 transition-all duration-200
                disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center gap-2 text-sm sm:text-base"
              aria-label="Next block"
            >
              <span aria-hidden="true">⏭</span> Next
            </button>
          </div>
        </section>

        {/* Voice Settings */}
        <section
          class="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6"
          aria-label="Voice settings"
        >
          <h2 class="text-xl font-semibold text-slate-200 mb-4">
            Voice Settings
          </h2>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Rate Control */}
            <div class="space-y-3">
              <label
                for="rate-slider"
                class="flex items-center justify-between"
              >
                <span class="text-sm font-medium text-slate-300">Speed</span>
                <span
                  class="text-sm font-mono text-cyan-400"
                  aria-live="polite"
                >
                  {rate().toFixed(1)}x
                </span>
              </label>
              <input
                id="rate-slider"
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={rate()}
                onInput={(e) => {
                  const val = +e.target.value;
                  setRate(val);
                  console.log("⚡ Speed changed to:", val);
                }}
                class="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                  accent-cyan-500 hover:accent-cyan-400"
                aria-label="Playback speed"
              />
              <div class="flex justify-between text-xs text-slate-500">
                <span>0.5x</span>
                <span>2.0x</span>
              </div>
            </div>

            {/* Pitch Control */}
            <div class="space-y-3">
              <label
                for="pitch-slider"
                class="flex items-center justify-between"
              >
                <span class="text-sm font-medium text-slate-300">Pitch</span>
                <span
                  class="text-sm font-mono text-cyan-400"
                  aria-live="polite"
                >
                  {pitch().toFixed(1)}
                </span>
              </label>
              <input
                id="pitch-slider"
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={pitch()}
                onInput={(e) => {
                  const val = +e.target.value;
                  setPitch(val);
                  console.log("🎵 Pitch changed to:", val);
                }}
                class="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                  accent-cyan-500 hover:accent-cyan-400"
                aria-label="Voice pitch"
              />
              <div class="flex justify-between text-xs text-slate-500">
                <span>Low</span>
                <span>High</span>
              </div>
            </div>

            {/* Voice Selection */}
            <div class="space-y-3">
              <label for="voice-select" class="block">
                <span class="text-sm font-medium text-slate-300 mb-2 block">
                  Voice
                </span>
                <div class="voice-selector-container">
                  {/* Standard CSS required for opt-in (Tailwind 4.0 handles this with arbitrary values or custom plugins) */}
                  <style>{`
    #voice-select, #voice-select::picker(select) { appearance: base-select; }
      #voice-select::picker-icon {
    display: none;
  }
  `}</style>
                  <select
                    id="voice-select"
                    onChange={(e) => {
                      const v = voices()[e.target.selectedIndex];
                      if (v) {
                        setVoice(v);
                        console.log("🎤 Voice changed to:", v.name);
                      }
                    }}
                    class="w-full bg-slate-700 border border-slate-600 rounded-lg text-white text-sm 
           focus:outline-none focus:ring-2 focus:ring-cyan-500 hover:border-slate-500 
           transition-all cursor-pointer p-0" /* p-0 because button handles padding */
                    aria-label="Select voice"
                  >
                    {/* 1. The Custom Button: Contains the display logic */}
                    <button
                      type="button"
                      class="flex items-center justify-between w-full px-4 py-2.5 text-left"
                    >
                      {/* @ts-ignore */}
                      <selectedcontent class="flex items-center gap-2 truncate"></selectedcontent>
                      {/* Native Arrow Replacement */}
                      <svg
                        class="w-4 h-4 text-slate-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <title>Open dropdown</title>
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>

                    {/* 2. Rich Options: Now supports nested HTML like icons */}
                    <For each={voices()}>
                      {(v) => {
                        const langCode = createMemo(() =>
                          v.lang.split("-")[0].toUpperCase()
                        );
                        const bgColor = createMemo(() => stringToColor(v.name));
                        const textColor = createMemo(() =>
                          getContrastYIQ(bgColor())
                        );

                        return (
                          <option class="flex items-center gap-3 px-4 py-2 bg-slate-700 text-white hover:bg-slate-600 transition-colors">
                            <div
                              class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                              style={{
                                "background-color": bgColor(),
                                color: textColor(),
                              }}
                            >
                              <span
                                class={`${getFontSize(langCode())} font-bold`}
                                style={{ color: textColor() }}
                              >
                                {langCode()}
                              </span>
                            </div>
                            <span class="font-medium">{v.name}</span>
                          </option>
                        );
                      }}
                    </For>
                  </select>
                </div>
              </label>
              <p class="text-xs text-slate-500" aria-live="polite">
                {voices().length} voices available
              </p>
            </div>
          </div>
        </section>

        {/* Content Display */}
        <Show when={blocks().length > 0}>
          <section class="space-y-4" aria-label="HTML preview">
            <h2 class="text-xl font-semibold text-slate-200">HTML Preview</h2>
            <article
              ref={articleEl}
              class="rounded-xl p-6 sm:p-8 lg:p-12 shadow-xl prose prose-slate max-w-none
                  prose-headings:text-gray-900 prose-headings:font-bold
                  prose-h1:text-4xl prose-h2:text-3xl prose-h3:text-2xl
                  prose-p:text-gray-700 prose-p:leading-relaxed
                  prose-li:text-gray-700
                  prose-code:bg-gray-100 prose-code:px-2 prose-code:py-1 prose-code:rounded
                  prose-pre:bg-gray-900 prose-pre:text-green-400
                  prose-blockquote:border-l-4 prose-blockquote:border-cyan-500 prose-blockquote:italic"
            >
              <BlocksToHTML
                blocks={blocks()}
                currentIndex={currentIndex()}
                setCurrentIndex={setCurrentIndex}
                speak={speak}
              />
            </article>
            <style>{`
                [data-block-index] {
                  transition: all 0.3s ease;
                  padding: 1rem;
                  margin: 0.5rem 0;
                  border-radius: 0.5rem;
                  cursor: pointer;
                }
                
                [data-block-index]:hover {
                  background-color: rgba(6, 182, 212, 0.1);
                }
                
                [data-block-index="${currentIndex()}"] {
                  background-color: rgba(6, 182, 212, 0.2);
                  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.4);
                  animation: pulse-highlight 2s ease-in-out infinite;
                }
                
                @keyframes pulse-highlight {
                  0%, 100% {
                    box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.4);
                  }
                  50% {
                    box-shadow: 0 0 0 6px rgba(6, 182, 212, 0.2);
                  }
                }
              `}</style>
          </section>
        </Show>

        {/* Empty State */}
        <Show when={blocks().length === 0}>
          <output class="text-center py-20 space-y-4" aria-live="polite">
            <div class="text-6xl opacity-20" aria-hidden="true">
              📄
            </div>
            <p class="text-slate-400">
              No markdown file loaded. Please upload a file to get started.
            </p>
          </output>
        </Show>
        {/* {blocks().length === 0 && (
          <div class="text-center py-20 space-y-4">
            <div class="text-6xl opacity-20">📄</div>
            <p class="text-slate-400 text-lg">No document loaded yet</p>
            <p class="text-slate-500 text-sm">
              Upload a markdown file to get started
            </p>
          </div>
        )} */}
      </div>
    </div>
  );
}
