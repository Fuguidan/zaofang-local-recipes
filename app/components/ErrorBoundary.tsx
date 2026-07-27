"use client";

import React from "react";
import { AppError, toAppError } from "../lib/errors";
import { logger } from "../lib/logger";

interface State {
  error?: AppError;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = {};

  static getDerivedStateFromError(error: unknown): State {
    return { error: toAppError(error) };
  }

  componentDidCatch(error: Error) {
    const appError = toAppError(error);
    void logger.error("ui", "render_failed", undefined, {
      errorCode: appError.code,
      message: appError.message,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { error } = this.state;
    return (
      <main className="fatal-shell">
        <section className="fatal-card">
          <span className="eyebrow">应用遇到了问题</span>
          <h1>这次没有做好，但你的本地数据仍在。</h1>
          <p>{error.userMessage}</p>
          <code>{error.code}</code>
          <div className="button-row">
            <button onClick={() => this.setState({ error: undefined })}>重试</button>
            <button className="button-secondary" onClick={() => location.assign("/")}>返回首页</button>
            <button className="button-ghost" onClick={() => navigator.clipboard.writeText(error.code)}>复制错误编号</button>
          </div>
        </section>
      </main>
    );
  }
}
