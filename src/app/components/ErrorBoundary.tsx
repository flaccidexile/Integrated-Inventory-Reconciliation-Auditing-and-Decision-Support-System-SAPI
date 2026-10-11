import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

/**
 * Catches a render error in a routed page so one broken screen cannot blank the
 * whole application.
 *
 * React unmounts the entire tree when a component throws and nothing above it
 * handles the error, which is what previously happened here: an exception inside
 * a charting component left an empty page with no sidebar, no header and no way
 * back, and nothing in the UI to say what went wrong.
 *
 * `resetKey` is the current route. When it changes the boundary clears its error
 * state, so navigating to a working module recovers without a reload.
 */

interface Props {
  children: ReactNode;
  /** Changing this clears the captured error — pass the current route. */
  resetKey?: string;
  /** Shown above the message, e.g. "Dashboard". */
  label?: string;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ info });
    // Kept: this is the only record of what threw, and it is what made the
    // original blank-screen bug diagnosable.
    console.error("Render error caught by ErrorBoundary:", error, info.componentStack);
  }

  componentDidUpdate(previous: Props): void {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, info: null });
    }
  }

  render(): ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const where = this.props.label ? ` in ${this.props.label}` : "";

    return (
      <div className="px-6 py-10" role="alert">
        <div className="max-w-2xl">
          <h1 className="text-[15px] font-semibold text-[#1a1d23] mb-1">
            This screen could not be displayed
          </h1>
          <p className="text-[12px] text-[#6c757d] mb-4">
            Something failed while rendering the module{where}. The rest of the system is unaffected —
            use the navigation to move to another screen.
          </p>

          <div className="rounded border border-[#f5c2c7] bg-[#fff5f5] px-3 py-2.5 mb-4">
            <p className="text-[12px] font-medium text-[#842029] break-words">
              {error.message || String(error)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null, info: null })}
              className="px-3 py-1.5 rounded bg-[#0d6efd] text-white text-[12px] hover:bg-[#0b5ed7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 rounded border border-[#dee2e6] bg-white text-[#495057] text-[12px] hover:bg-[#f8f9fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Reload the page
            </button>
          </div>

          {import.meta.env.DEV && info?.componentStack ? (
            <details className="mt-5">
              <summary className="text-[11px] text-[#6c757d] cursor-pointer">
                Component stack (development only)
              </summary>
              <pre className="mt-2 text-[10px] text-[#495057] bg-[#f8f9fa] border border-[#dee2e6] rounded p-3 overflow-x-auto whitespace-pre-wrap">
                {info.componentStack.trim()}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    );
  }
}
