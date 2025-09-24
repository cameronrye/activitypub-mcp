// Main JavaScript for ActivityPub MCP site
(() => {
  // Mobile navigation toggle
  function initMobileNav() {
    const toggle = document.querySelector(".navbar-toggle");
    const nav = document.querySelector(".navbar-nav");

    if (!toggle || !nav) return;

    // Initialize aria-expanded attribute
    toggle.setAttribute("aria-expanded", "false");

    toggle.addEventListener("click", (event) => {
      event.stopPropagation(); // Prevent event bubbling

      const isExpanded = nav.classList.contains("show");

      if (isExpanded) {
        nav.classList.remove("show");
        toggle.classList.remove("active");
        toggle.setAttribute("aria-expanded", "false");
      } else {
        nav.classList.add("show");
        toggle.classList.add("active");
        toggle.setAttribute("aria-expanded", "true");
      }
    });

    // Close mobile nav when clicking outside
    document.addEventListener("click", (event) => {
      const isClickInsideNav = nav.contains(event.target);
      const isClickOnToggle = toggle.contains(event.target);
      const isNavVisible = nav.classList.contains("show");

      if (isNavVisible && !isClickInsideNav && !isClickOnToggle) {
        nav.classList.remove("show");
        toggle.classList.remove("active");
        toggle.setAttribute("aria-expanded", "false");
      }
    });

    // Close mobile nav on escape key
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.classList.contains("show")) {
        nav.classList.remove("show");
        toggle.classList.remove("active");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus(); // Return focus to toggle button for accessibility
      }
    });

    // Close mobile nav when clicking on navigation links
    const navLinks = nav.querySelectorAll(".nav-link");
    for (const link of navLinks) {
      link.addEventListener("click", () => {
        if (nav.classList.contains("show")) {
          nav.classList.remove("show");
          toggle.classList.remove("active");
          toggle.setAttribute("aria-expanded", "false");
        }
      });
    }

    // Close mobile nav when resizing to desktop view
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 768 && nav.classList.contains("show")) {
        nav.classList.remove("show");
        toggle.classList.remove("active");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Smooth scrolling for anchor links
  function initSmoothScrolling() {
    const links = document.querySelectorAll('a[href^="#"]');

    for (const link of links) {
      link.addEventListener("click", function (event) {
        const href = this.getAttribute("href");

        // Skip if it's just "#"
        if (href === "#") return;

        const target = document.querySelector(href);
        if (target) {
          event.preventDefault();

          const headerHeight = document.querySelector(".site-header")?.offsetHeight || 0;
          const targetPosition = target.offsetTop - headerHeight - 20;

          window.scrollTo({
            top: targetPosition,
            behavior: "smooth",
          });

          // Update URL without triggering scroll
          history.pushState(null, null, href);
        }
      });
    }
  }

  // Tab functionality for installation instructions
  function initTabs() {
    const tabButtons = document.querySelectorAll(".tab-button");
    const tabPanes = document.querySelectorAll(".tab-pane");

    if (tabButtons.length === 0) return;

    for (const button of tabButtons) {
      button.addEventListener("click", function () {
        const targetTab = this.getAttribute("data-tab");

        // Remove active class from all buttons and panes
        for (const btn of tabButtons) {
          btn.classList.remove("active");
        }
        for (const pane of tabPanes) {
          pane.classList.remove("active");
        }

        // Add active class to clicked button and corresponding pane
        this.classList.add("active");
        const targetPane = document.getElementById(targetTab);
        if (targetPane) {
          targetPane.classList.add("active");
        }
      });
    }
  }

  // Copy code functionality
  function initCodeCopy() {
    const codeBlocks = document.querySelectorAll("pre code");

    for (const codeBlock of codeBlocks) {
      const pre = codeBlock.parentElement;

      // Create copy button
      const copyButton = document.createElement("button");
      copyButton.className = "copy-button";
      copyButton.innerHTML = "Copy";
      copyButton.setAttribute("aria-label", "Copy code to clipboard");

      // Add copy button to pre element
      pre.style.position = "relative";
      pre.appendChild(copyButton);

      copyButton.addEventListener("click", async function () {
        try {
          await navigator.clipboard.writeText(codeBlock.textContent);

          // Visual feedback
          this.innerHTML = "Copied!";
          this.classList.add("copied");

          setTimeout(() => {
            this.innerHTML = "Copy";
            this.classList.remove("copied");
          }, 2000);
        } catch (err) {
          console.error("Failed to copy code:", err);

          // Fallback for older browsers
          const textArea = document.createElement("textarea");
          textArea.value = codeBlock.textContent;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);

          this.innerHTML = "Copied!";
          setTimeout(() => {
            this.innerHTML = "Copy";
          }, 2000);
        }
      });
    }
  }

  // Scroll to top functionality
  function initScrollToTop() {
    const scrollButton = document.createElement("button");
    scrollButton.className = "scroll-to-top";
    scrollButton.innerHTML = "↑";
    scrollButton.setAttribute("aria-label", "Scroll to top");
    scrollButton.style.display = "none";

    document.body.appendChild(scrollButton);

    // Show/hide button based on scroll position
    window.addEventListener("scroll", () => {
      if (window.pageYOffset > 300) {
        scrollButton.style.display = "block";
      } else {
        scrollButton.style.display = "none";
      }
    });

    // Scroll to top when clicked
    scrollButton.addEventListener("click", () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });
  }

  // Theme toggle (if needed in the future)
  function initThemeToggle() {
    // Placeholder for theme toggle functionality
    // Can be implemented later if dark mode toggle is needed
  }

  // Initialize all functionality
  function init() {
    initMobileNav();
    initSmoothScrolling();
    initTabs();
    initCodeCopy();
    initScrollToTop();
    initThemeToggle();
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
