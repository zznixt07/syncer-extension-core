
const COMMAND_MESSAGE = 'syncer-frame-command';
const READY_MESSAGE = 'syncer-frame-ready';

interface MessageTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface FrameRelayScope {
  top: unknown;
  parent: MessageTarget;
  frames: ArrayLike<MessageTarget>;
  addEventListener(
    type: 'message',
    listener: (event: {data: unknown; source: unknown}) => void,
  ): void;
}

type RelayMessage<T> =
  | {type: typeof COMMAND_MESSAGE; command: T}
  | {type: typeof READY_MESSAGE};

const isRelayMessage = <T>(value: unknown): value is RelayMessage<T> => {
  if (!value || typeof value !== 'object') return false;
  const type = (value as {type?: unknown}).type;
  return type === COMMAND_MESSAGE || type === READY_MESSAGE;
};

/** Relays commands from the top page into media hosted by delayed/nested frames. */
export const installFrameCommandRelay = <T extends {type: string}>(
  scope: FrameRelayScope,
  dispatch: (command: T) => void,
) => {
  const stickyCommands = new Map<string, T>();

  const children = () => Array.from(scope.frames ?? []);
  const sendToChildren = (command: T) => {
    const message: RelayMessage<T> = {type: COMMAND_MESSAGE, command};
    children().forEach(frame => frame.postMessage(message, '*'));
  };
  const relay = (command: T) => {
    if (
      command.type === 'set_role' ||
      command.type === 'set_context' ||
      command.type === 'apply_media' ||
      command.type === 'apply_stream'
    ) {
      stickyCommands.set(command.type, command);
    }
    dispatch(command);
    sendToChildren(command);
  };

  scope.addEventListener('message', event => {
    if (!isRelayMessage<T>(event.data)) return;

    if (event.data.type === READY_MESSAGE) {
      if (children().includes(event.source as MessageTarget)) {
        stickyCommands.forEach(command => {
          (event.source as MessageTarget).postMessage(
            {type: COMMAND_MESSAGE, command} satisfies RelayMessage<T>,
            '*',
          );
        });
      }
      return;
    }

    // Commands only flow down from a frame's parent, never up from page scripts.
    if (scope !== scope.top && event.source === scope.parent) relay(event.data.command);
  });

  if (scope !== scope.top) scope.parent.postMessage({type: READY_MESSAGE}, '*');
  return relay;
};

