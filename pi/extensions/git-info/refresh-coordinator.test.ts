import assert from "node:assert/strict";
import test from "node:test";
import { Deferred, Effect, Fiber } from "effect";
import { makeRefreshCoordinator } from "./src/refresh-coordinator.ts";

test("an explicit refresh waits for an active background refresh", async () => {
  const coordinator = makeRefreshCoordinator();
  let state = 0;
  let skipped = 0;

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const background = yield* Effect.forkChild(
        coordinator.run(
          Effect.gen(function* () {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(release);
            state = 1;
          }),
        ),
      );

      yield* Deferred.await(started);
      // The background refresh holds the permit, so this one must not run at
      // all. A separate counter, because the background effect would overwrite
      // any change this made to `state`.
      yield* coordinator.runIfIdle(
        Effect.sync(() => {
          skipped += 1;
        }),
      );
      assert.equal(skipped, 0, "a busy coordinator must skip runIfIdle");

      const forced = yield* Effect.forkChild(
        coordinator.run(
          Effect.sync(() => {
            state += 1;
            return state;
          }),
        ),
      );

      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(background);
      return yield* Fiber.join(forced);
    }),
  );

  assert.equal(result, 2);
  assert.equal(state, 2);
  assert.equal(skipped, 0);
});

test("runIfIdle runs the effect when nothing holds the permit", async () => {
  const coordinator = makeRefreshCoordinator();
  let ran = 0;

  await Effect.runPromise(
    coordinator.runIfIdle(
      Effect.sync(() => {
        ran += 1;
      }),
    ),
  );

  assert.equal(ran, 1);
});
