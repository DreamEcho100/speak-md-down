# TODOs

- [ ] Having the layout be editor at top, options/controls in middle, preview at bottom on mobile, and in desktop have editor and preview side by side _(use CSS grid and `contents`?)_
- [ ] Account for if `selectedcontent` is not supported in some browsers (e.g., Safari) and provide a fallback
- [ ] Improve the options panel with better grouping, tooltips, and maybe icons for better UX, and increase the range of speech rate/pitch/volume sliders
- [ ] Add option to select different voices for different markdown elements (e.g., headings, lists, code blocks)
- [ ] Add keyboard shortcuts for play/pause, stop, load file, etc.
- [ ] Add option to save/load settings (voice, rate, pitch, volume) to/from local storage
- [ ] Add option to loop reading or read continuously when reaching the end
- [ ] Add a reset when reaching the end of the speech synthesis and the blocks highlighting
- [ ] Add a progress bar or indicator for speech synthesis progress
- [ ] Improve markdown parsing to handle inline styles (bold, italic, links) and nested lists
- [ ] Improve HTML rendering to wrap lists in <ul>/<ol> and add proper table support, images, etc.
- [ ] Add syntax highlighting to code blocks using a library like Prism.js
- [ ] Add better error handling and user feedback for file loading and speech synthesis issues
- [ ] Improve UI/UX with better styling, animations, and responsive design
- [ ] Optimize performance for large markdown files
- [ ] Optimize the solid-js reactivity usage if needed
