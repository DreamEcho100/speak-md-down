import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";

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
 * //   { type: "heading", text: "Hello", level: 1 },
 * //   { type: "paragraph", text: "This is a paragraph." }
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
      });
      continue;
    }

    // Parse blockquotes (> text)
    if (trimmed.startsWith("> ")) {
      flushParagraph();
      blocks.push({
        type: "blockquote",
        text: trimmed.replace(/^>\s*/, ""),
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
 * Convert markdown blocks to HTML string.
 *
 * Each block is wrapped with a data-block-index attribute for:
 * - TTS synchronization (highlighting current speaking block)
 * - Click-to-speak functionality
 * - Scroll-to-view behavior
 *
 * CURRENT HTML STRUCTURE:
 * - Headings: <h1-6> with dynamic sizing classes
 * - Paragraphs: <p> with prose styling
 * - Lists: Individual <li> elements (not wrapped in <ul>/<ol>)
 * - Code: <pre><code> with syntax-friendly styling
 * - Blockquotes: <blockquote> with left border
 *
 * FUTURE IMPROVEMENTS:
 * - Wrap consecutive list items in proper <ul>/<ol> tags
 * - Add syntax highlighting to code blocks using language hint
 * - Convert inline markdown (bold, italic, links)
 * - Add proper table rendering
 * - Support image tags with <img>
 *
 * @param {MdBlock[]} blocks - Array of parsed markdown blocks
 * @returns {string} HTML string with data-block-index attributes
 *
 * @example
 * const html = blocksToHTML([
 *   { type: "heading", text: "Title", level: 1 },
 *   { type: "paragraph", text: "Content here" }
 * ]);
 * // Returns: '<h1 data-block-index="0" class="heading-1">Title</h1>\n<p data-block-index="1" class="paragraph">Content here</p>'
 */
function blocksToHTML(blocks) {
  return blocks
    .map((block, index) => {
      const dataAttr = `data-block-index="${index}"`;

      switch (block.type) {
        case "heading": {
          const level = block.level || 1;
          return `<h${level} ${dataAttr} class="heading-${level}">${escapeHTML(
            block.text
          )}</h${level}>`;
        }

        case "paragraph":
          return `<p ${dataAttr} class="paragraph">${escapeHTML(
            block.text
          )}</p>`;

        case "list": {
          // NOTE: Currently renders individual <li> without parent <ul>/<ol>
          // Future: Group consecutive list items and wrap them properly
          const listType = block.ordered ? "ol" : "ul";
          return `<li ${dataAttr} class="list-item" data-list-type="${listType}">${escapeHTML(
            block.text
          )}</li>`;
        }

        case "code": {
          // NOTE: Could add syntax highlighting here in the future
          // Example: Use Prism.js or highlight.js with language from codeLanguage
          return `<pre ${dataAttr} class="code-block"><code>${escapeHTML(
            block.text
          )}</code></pre>`;
        }

        case "blockquote":
          return `<blockquote ${dataAttr} class="blockquote">${escapeHTML(
            block.text
          )}</blockquote>`;

        default:
          return `<div ${dataAttr}>${escapeHTML(block.text)}</div>`;
      }
    })
    .join("\n");
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

  /* ---------- state ---------- */
  const [blocks, setBlocks] = createSignal(/** @type {MdBlock[]} */ ([]));
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [isPaused, setIsPaused] = createSignal(false); // NEW: Track paused state
  const [viewMode, setViewMode] = createSignal(
    /** @type {"markdown" | "html"} */ ("markdown")
  );
  const [rate, setRate] = createSignal(1);
  const [pitch, setPitch] = createSignal(1);
  const [voices, setVoices] = createSignal(
    /** @type {SpeechSynthesisVoice[]} */ ([])
  );
  const [voice, setVoice] = createSignal(
    /** @type {SpeechSynthesisVoice | null} */ (null)
  );

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

    synth.onvoiceschanged = () => {
      console.log("🔔 voiceschanged event fired!");
      loadVoices();

      setTimeout(() => {
        if (synth.getVoices().length === 0) {
          console.log("⏳ Retrying voice load after 100ms");
          loadVoices();
        }
      }, 100);

      setTimeout(() => {
        if (synth.getVoices().length === 0) {
          console.log("⏳ Retrying voice load after 500ms");
          loadVoices();
        }
      }, 500);
    };
  });

  /* ---------- highlight management ---------- */
  /**
   * Auto-scroll highlighted block into view when index changes.
   * Only applies in HTML view mode.
   */
  createEffect(() => {
    const idx = currentIndex();
    console.log("🎯 Current index changed to:", idx);

    if (viewMode() === "html") {
      requestAnimationFrame(() => {
        const element = document.querySelector(`[data-block-index="${idx}"]`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          console.log("📜 Scrolled to block", idx);
        }
      });
    }
  });

  /* ---------- core speech ---------- */
  /**
   * Start speaking from a specific block index.
   * Recursively speaks each block until the end or until stopped.
   *
   * @param {number} index - Block index to start from
   */
  function speakFrom(index) {
    console.log("🎯 speakFrom called with index:", index);
    console.log("📚 Total blocks:", blocks().length);

    if (!blocks().length) {
      console.warn("⚠️ No blocks to speak");
      return;
    }

    console.log("🛑 Cancelling previous speech");
    synth.cancel();
    shouldContinue = true; // Reset flag when starting new playback
    setIsPlaying(true);
    setIsPaused(false);
    setCurrentIndex(index);

    const list = blocks();

    /**
     * Speak a single block and continue to the next if shouldContinue is true.
     *
     * @param {number} i - Current block index
     */
    function speakBlock(i) {
      console.log("🗣️ speakBlock called for index:", i);

      if (i >= list.length) {
        console.log("✅ Finished speaking all blocks");
        setIsPlaying(false);
        setIsPaused(false);
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
          speakBlock(i + 1);
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
        setIsPlaying(false);
        setIsPaused(false);
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

    speakBlock(index);
  }

  /* ---------- public speak API ---------- */
  /**
   * Start or restart speech from current or specified index.
   *
   * @param {number} [index] - Optional index to speak from
   */
  function speak(index = currentIndex()) {
    console.log("🎤 speak() called with index:", index);
    speakFrom(index);
  }

  /* ---------- transport controls ---------- */

  /**
   * PLAY: Start speaking from current position
   * - If not playing and not paused: starts from current block
   * - Does nothing if already playing
   */
  function play() {
    console.log("▶️ Play clicked");
    if (!isPlaying() && !isPaused()) {
      speak();
    }
  }

  /**
   * PAUSE: Temporarily halt speech (can resume from same position)
   * - Pauses the current utterance mid-speech
   * - Can be resumed with resume() to continue from same position
   * - Sets isPaused flag to true
   */
  function pause() {
    console.log("⏸️ Pause clicked");
    if (synth.speaking && !synth.paused) {
      shouldContinue = false; // Don't advance to next block
      synth.pause();
      setIsPlaying(false);
      setIsPaused(true);
      console.log("⏸️ Speech paused");
    }
  }

  /**
   * RESUME: Continue from where pause stopped
   * - Only works if currently paused
   * - Continues speaking the same utterance from where it was paused
   * - Re-enables advancing to next blocks
   */
  function resume() {
    console.log("⏯️ Resume clicked");
    if (synth.paused && isPaused()) {
      shouldContinue = true; // Allow advancing to next blocks again
      synth.resume();
      setIsPlaying(true);
      setIsPaused(false);
      console.log("⏯️ Speech resumed");
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
    console.log("⏹️ Stop clicked");
    shouldContinue = false; // Don't advance to next block
    if (synth.speaking || synth.pending) {
      synth.cancel();
      setIsPlaying(false);
      setIsPaused(false);
      console.log("⏹️ Speech stopped");
    }
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
   * PROCESS:
   * 1. Read file as text
   * 2. Parse markdown into blocks using parseMarkdown()
   * 3. Store blocks in state for rendering and TTS
   * 4. Reset playback state
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
      console.log("First 200 chars:", text.substring(0, 200));

      // Parse markdown into structured blocks
      const parsed = parseMarkdown(text);
      console.log("🔧 Parsed into", parsed.length, "blocks");
      parsed.forEach((block, i) => {
        console.log(
          `  Block ${i}: ${block.type} - ${block.text.substring(0, 50)}...`
        );
      });

      synth.cancel();
      setBlocks(parsed);
      setCurrentIndex(0);
      setIsPlaying(false);
      console.log("✅ File loaded successfully");
    } catch (error) {
      console.error("❌ Error loading file:", error);
    }
  }

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
    console.log("🧹 Cleaning up - cancelling speech");
    synth.cancel();
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
            Upload a markdown file and let it speak to you with highlighted text
          </p>
        </header>

        {/* File Upload Section */}
        <section
          class="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-xl"
          aria-label="File upload"
        >
          <label class="block">
            <span class="text-sm font-medium text-slate-300 mb-3 block">
              Choose Markdown File
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
              class="block w-full text-sm text-slate-400
                file:mr-4 file:py-3 file:px-6
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
        </section>

        {/* View Mode Toggle */}
        <Show when={blocks().length > 0}>
          <section
            class="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-xl"
            aria-label="View mode selector"
          >
            <h2 class="text-xl font-semibold text-slate-200 mb-4">View Mode</h2>
            <fieldset
              class="flex gap-3 max-w-full min-w-full w-full"
              aria-label="View mode options"
            >
              <button
                type="button"
                onClick={() => setViewMode("markdown")}
                class={`flex-1 px-6 py-3 rounded-lg font-medium transition-all duration-200
                  ${
                    viewMode() === "markdown"
                      ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                aria-pressed={viewMode() === "markdown"}
              >
                📝 Markdown Blocks
              </button>
              <button
                type="button"
                onClick={() => setViewMode("html")}
                class={`flex-1 px-6 py-3 rounded-lg font-medium transition-all duration-200
                  ${
                    viewMode() === "html"
                      ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                aria-pressed={viewMode() === "html"}
              >
                🌐 HTML Preview
              </button>
            </fieldset>
          </section>
        </Show>

        {/* Playback Controls */}
        <section
          class="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6"
          aria-label="Playback controls"
        >
          <h2 class="text-xl font-semibold text-slate-200 mb-4">
            Playback Controls
          </h2>

          <div class="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={play}
              disabled={blocks().length === 0 || (isPlaying() && !isPaused())}
              class="px-4 sm:px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg font-medium
                hover:from-green-400 hover:to-emerald-500 transition-all duration-200
                shadow-lg hover:shadow-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center gap-2 text-sm sm:text-base"
              aria-label="Play from current position"
            >
              <span aria-hidden="true">▶</span> Play
            </button>

            <button
              type="button"
              onClick={pause}
              disabled={!isPlaying() || isPaused()}
              class="px-4 sm:px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg font-medium
                hover:from-yellow-400 hover:to-orange-400 transition-all duration-200
                shadow-lg hover:shadow-yellow-500/30 disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center gap-2 text-sm sm:text-base"
              aria-label="Pause playback"
            >
              <span aria-hidden="true">⏸</span> Pause
            </button>

            <button
              type="button"
              onClick={resume}
              disabled={!isPaused()}
              class="px-4 sm:px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg font-medium
                hover:from-blue-400 hover:to-indigo-500 transition-all duration-200
                shadow-lg hover:shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center gap-2 text-sm sm:text-base"
              aria-label="Resume playback"
            >
              <span aria-hidden="true">⏯</span> Resume
            </button>

            <button
              type="button"
              onClick={stop}
              disabled={!isPlaying() && !isPaused()}
              class="px-4 sm:px-6 py-3 bg-gradient-to-r from-red-500 to-pink-600 rounded-lg font-medium
                hover:from-red-400 hover:to-pink-500 transition-all duration-200
                shadow-lg hover:shadow-red-500/30
                flex items-center gap-2 text-sm sm:text-base"
              aria-label="Stop playback"
            >
              <span aria-hidden="true">⏹</span> Stop
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
          <section
            class="space-y-4"
            aria-label={
              viewMode() === "markdown" ? "Markdown blocks" : "HTML preview"
            }
          >
            <h2 class="text-xl font-semibold text-slate-200">
              {viewMode() === "markdown" ? "Document Blocks" : "HTML Preview"}
            </h2>

            <Show when={viewMode() === "markdown"}>
              {/** biome-ignore lint/a11y/useSemanticElements: <explanation> */}
              <div class="space-y-3" role="list">
                <For each={blocks()}>
                  {(block, i) => (
                    // biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: false positive
                    // biome-ignore lint/a11y/useSemanticElements: false positive
                    <button
                      type="button"
                      onClick={() => {
                        console.log("🖱️ Block clicked:", i());
                        stop();
                        setCurrentIndex(i());
                        speak(i());
                      }}
                      class={`w-full text-left px-6 py-4 rounded-xl transition-all duration-200 border-2
                        ${
                          i() === currentIndex()
                            ? "bg-cyan-500/20 border-cyan-500 shadow-lg shadow-cyan-500/20"
                            : "bg-slate-800/50 border-slate-700 hover:border-slate-600 hover:bg-slate-800"
                        }`}
                      role="listitem"
                      aria-current={i() === currentIndex() ? "true" : undefined}
                      aria-label={`${block.type} block ${i() + 1} of ${
                        blocks().length
                      }`}
                    >
                      <Show when={block.type === "heading"}>
                        <h3
                          class={`font-bold text-cyan-400 ${
                            block.level === 1
                              ? "text-3xl"
                              : block.level === 2
                              ? "text-2xl"
                              : block.level === 3
                              ? "text-xl"
                              : "text-lg"
                          }`}
                        >
                          {block.text}
                        </h3>
                      </Show>
                      <Show when={block.type === "paragraph"}>
                        <p class="text-slate-300 leading-relaxed">
                          {block.text}
                        </p>
                      </Show>
                      <Show when={block.type === "list"}>
                        <li class="text-slate-300 ml-6 list-disc marker:text-cyan-400">
                          {block.text}
                        </li>
                      </Show>
                      <Show when={block.type === "code"}>
                        <pre class="text-sm bg-slate-900/50 p-4 rounded-lg overflow-x-auto">
                          <code class="text-green-400">{block.text}</code>
                        </pre>
                      </Show>
                      <Show when={block.type === "blockquote"}>
                        <blockquote class="border-l-4 border-cyan-500 pl-4 italic text-slate-300">
                          {block.text}
                        </blockquote>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>

            <Show when={viewMode() === "html"}>
              <article
                class="bg-white text-gray-900 rounded-xl p-6 sm:p-8 lg:p-12 shadow-xl prose prose-slate max-w-none
                  prose-headings:text-gray-900 prose-headings:font-bold
                  prose-h1:text-4xl prose-h2:text-3xl prose-h3:text-2xl
                  prose-p:text-gray-700 prose-p:leading-relaxed
                  prose-li:text-gray-700
                  prose-code:bg-gray-100 prose-code:px-2 prose-code:py-1 prose-code:rounded
                  prose-pre:bg-gray-900 prose-pre:text-green-400
                  prose-blockquote:border-l-4 prose-blockquote:border-cyan-500 prose-blockquote:italic"
                innerHTML={blocksToHTML(blocks())}
              />
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
            </Show>
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
