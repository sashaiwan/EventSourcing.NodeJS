import {
  ANY,
  EventStoreDBClient,
  NO_STREAM,
  StreamNotFoundError,
  jsonEvent,
} from '@eventstore/db-client';
import { Event } from './events';

export interface EventStore {
  aggregateStream<Entity, E extends Event>(
    streamName: string,
    options: {
      evolve: (currentState: Entity, event: E) => Entity;
      getInitialState: () => Entity;
    },
  ): Promise<Entity | null>;

  readStream<E extends Event>(streamName: string): Promise<E[]>;

  appendToStream<E extends Event>(
    streamId: string,
    events: E[],
    options?: { expectedRevision?: bigint },
  ): Promise<bigint>;
}

export const getEventStore = (eventStore: EventStoreDBClient): EventStore => {
  return {
    aggregateStream: async <Entity, E extends Event>(
      streamName: string,
      options: {
        evolve: (currentState: Entity, event: E) => Entity;
        getInitialState: () => Entity;
      },
    ): Promise<Entity | null> => {
      try {
        const { evolve, getInitialState } = options;

        let state = getInitialState();

        for await (const { event } of eventStore.readStream(streamName)) {
          if (!event) continue;
          state = evolve(state, <E>{
            type: event.type,
            data: event.data,
          });
        }
        return state;
      } catch (error) {
        if (error instanceof StreamNotFoundError) {
          return null;
        }

        throw error;
      }
    },
    readStream: async <E extends Event>(streamName: string): Promise<E[]> => {
      const events: E[] = [];

      try {
        for await (const { event } of eventStore.readStream(streamName)) {
          if (!event) continue;
          events.push(<E>{
            type: event.type,
            data: event.data,
          });
        }
        return events;
      } catch (error) {
        if (error instanceof StreamNotFoundError) {
          return [];
        }

        throw error;
      }
    },
    appendToStream: async <E extends Event>(
      streamId: string,
      events: E[],
      options?: { expectedRevision?: bigint },
    ): Promise<bigint> => {
      const serializedEvents = events.map(jsonEvent);

      const appendResult = await eventStore.appendToStream(
        streamId,
        serializedEvents,
        {
          expectedRevision:
            options?.expectedRevision != undefined
              ? options.expectedRevision !== 0n
                ? options.expectedRevision
                : NO_STREAM
              : ANY,
        },
      );

      return appendResult.nextExpectedRevision;
    },
  };
};

export const EventStoreErrors = {
  WrongExpectedRevision: 'WrongExpectedRevision',
};
