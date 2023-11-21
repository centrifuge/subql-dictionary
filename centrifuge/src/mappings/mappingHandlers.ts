import { EventRecord } from "@polkadot/types/interfaces";
import { SubstrateExtrinsic, SubstrateBlock } from "@subql/types";
import { SpecVersion, Event, Extrinsic } from "../types";

let specVersion: SpecVersion;
export async function handleBlock(block: SubstrateBlock): Promise<void> {
  // Initialise Spec Version
  if (!specVersion) {
    specVersion = await SpecVersion.get(block.specVersion.toString());
  }

  // Check for updates to Spec Version
  if (!specVersion || specVersion.id !== block.specVersion.toString()) {
    specVersion = new SpecVersion(
      block.specVersion.toString(),
      block.block.header.number.toBigInt()
    );
    await specVersion.save();
  }

  // Process all events in block
  const events = block.events
    .filter(
      (evt) =>
        !(
          evt.event.section === "system" &&
          evt.event.method === "ExtrinsicSuccess"
        )
    )
    .map((evt, idx) =>
      handleEvent(block.block.header.number.toString(), idx, evt)
    );

  // Process all calls in block
  const calls = wrapExtrinsics(block).map((ext, idx) =>
    handleCall(`${block.block.header.number.toString()}-${idx}`, ext)
  );

  // Save all data
  await Promise.all([
    store.bulkCreate("Event", events),
    store.bulkCreate("Extrinsic", calls),
  ]);
}

function handleEvent(
  blockNumber: string,
  eventIdx: number,
  event: EventRecord
): Event {
  const newEvent = new Event(
    `${blockNumber}-${eventIdx}`,
    event.event.section,
    event.event.method,
    BigInt(blockNumber)
  );
  return newEvent;
}

function handleCall(idx: string, extrinsic: SubstrateExtrinsic): Extrinsic {
  const txHash = extrinsic.extrinsic.hash.toString();
  const module = extrinsic.extrinsic.method.section;
  const call = extrinsic.extrinsic.method.method;
  const blockHeight = extrinsic.block.block.header.number.toBigInt();
  const success = extrinsic.success;
  const isSigned = extrinsic.extrinsic.isSigned;
  const newExtrinsic = new Extrinsic(
    idx,
    txHash,
    module,
    call,
    blockHeight,
    success,
    isSigned
  );
  return newExtrinsic;
}

function wrapExtrinsics(wrappedBlock: SubstrateBlock): SubstrateExtrinsic[] {
  return wrappedBlock.block.extrinsics.map((extrinsic, idx) => {
    const events = wrappedBlock.events.filter(
      ({ phase }) => phase.isApplyExtrinsic && phase.asApplyExtrinsic.eqn(idx)
    );
    return {
      idx,
      extrinsic,
      block: wrappedBlock,
      events,
      success:
        events.findIndex((evt) => evt.event.method === "ExtrinsicSuccess") > -1,
    };
  });
}
