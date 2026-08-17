import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

/** Native details, styled to match panel section titles. */
@customElement("flipcel-disclosure")
export class FlipCelDisclosure extends LitElement {
  @property({ type: String }) label = "";
  @property({ type: Boolean, reflect: true }) open = false;

  static styles = css`
    :host {
      display: block;
      width: 100%;
      min-width: 0;
    }

    details {
      min-width: 0;
    }

    summary {
      list-style: none;
      cursor: pointer;
      user-select: none;
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      font: inherit;
      font-size: var(--flipcel-block-font-size, 11px);
      font-weight: 500;
      letter-spacing: var(--flipcel-letter-spacing, -0.011em);
      color: var(--flipcel-text-primary, #1a1a1a);
    }

    summary::-webkit-details-marker {
      display: none;
    }

    summary::before {
      content: "";
      width: 0;
      height: 0;
      border-style: solid;
      border-width: 4px 0 4px 6px;
      border-color: transparent transparent transparent currentColor;
      opacity: 0.55;
      transform: rotate(0deg);
      transition: transform 80ms ease;
    }

    details[open] summary::before {
      transform: rotate(90deg);
    }

    .body {
      display: flex;
      flex-direction: column;
      gap: var(--flipcel-space-2, 8px);
      min-width: 0;
      margin-top: var(--flipcel-space-2, 8px);
    }
  `;

  render() {
    return html`
      <details
        ?open=${this.open}
        @toggle=${(e: Event) => {
          const next = (e.target as HTMLDetailsElement).open;
          if (this.open !== next) this.open = next;
        }}
      >
        <summary data-interactive>${this.label}</summary>
        <div class="body">
          <slot></slot>
        </div>
      </details>
    `;
  }
}
