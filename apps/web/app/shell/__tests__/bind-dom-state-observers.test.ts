/**
 * @jest-environment jsdom
 */
import { bindDomStateObservers } from "../bind-dom-state-observers";

type IOEntry = { target: Element };
type IOCallback = (entries: IOEntry[]) => void;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  observed = new Set<Element>();
  callback: IOCallback;
  constructor(cb: IOCallback) {
    this.callback = cb;
    MockIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.add(el);
  }
  unobserve(el: Element) {
    this.observed.delete(el);
  }
  disconnect() {
    this.observed.clear();
  }
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  (globalThis as unknown as { IntersectionObserver: typeof MockIntersectionObserver })
    .IntersectionObserver = MockIntersectionObserver;
  document.body.innerHTML = "";
});

function flushMutations() {
  // MutationObserver callbacks are microtasks in jsdom.
  return new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe("bindDomStateObservers", () => {
  it("registers initial [data-observe] nodes", () => {
    const a = document.createElement("div");
    a.setAttribute("data-observe", "");
    const b = document.createElement("div");
    b.setAttribute("data-observe", "");
    document.body.append(a, b);

    bindDomStateObservers();

    const io = MockIntersectionObserver.instances[0];
    expect(io).toBeDefined();
    expect(io.observed.has(a)).toBe(true);
    expect(io.observed.has(b)).toBe(true);
  });

  it("registers nodes added after binding (post-mount / route change)", async () => {
    const a = document.createElement("div");
    a.setAttribute("data-observe", "");
    document.body.append(a);

    bindDomStateObservers();
    const io = MockIntersectionObserver.instances[0];
    expect(io.observed.size).toBe(1);

    const c = document.createElement("div");
    c.setAttribute("data-observe", "");
    document.body.append(c);
    await flushMutations();

    expect(io.observed.has(c)).toBe(true);
  });

  it("deregisters removed nodes", async () => {
    const a = document.createElement("div");
    a.setAttribute("data-observe", "");
    document.body.append(a);

    bindDomStateObservers();
    const io = MockIntersectionObserver.instances[0];
    expect(io.observed.has(a)).toBe(true);

    a.remove();
    await flushMutations();

    expect(io.observed.has(a)).toBe(false);
  });

  it("picks up nodes gaining data-observe attribute post-mount", async () => {
    const a = document.createElement("div");
    document.body.append(a);

    bindDomStateObservers();
    const io = MockIntersectionObserver.instances[0];
    expect(io.observed.has(a)).toBe(false);

    a.setAttribute("data-observe", "");
    await flushMutations();

    expect(io.observed.has(a)).toBe(true);
  });

  it("teardown stops tracking subsequent additions", async () => {
    bindDomStateObservers();
    const teardown = bindDomStateObservers();
    teardown();

    // Second binding's IO was cleared by teardown; any new additions should
    // NOT register with the torn-down observer.
    const secondIo = MockIntersectionObserver.instances[1];
    const before = secondIo.observed.size;

    const late = document.createElement("div");
    late.setAttribute("data-observe", "");
    document.body.append(late);
    await flushMutations();

    expect(secondIo.observed.size).toBe(before);
    expect(secondIo.observed.has(late)).toBe(false);
  });
});
