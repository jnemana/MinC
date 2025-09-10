import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state = {error:null}; }
  static getDerivedStateFromError(error){ return {error}; }
  componentDidCatch(err, info){ console.error("React error:", err, info); }
  render(){
    if (this.state.error) {
      return (
        <pre style={{padding:16, background:"#fee", color:"#900", borderRadius:12}}>
{String(this.state.error?.stack || this.state.error)}
        </pre>
      );
    }
    return this.props.children;
  }
}
