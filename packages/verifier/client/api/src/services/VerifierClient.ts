import {
  BaseContractError,
  handleContractError,
  handleError,
  PolywrapVotingSystem,
  traceFunc,
  TransactionError,
} from "@polywrap/registry-js";
import { Logger } from "winston";
import { VerifierClientConfig } from "../config/VerifierClientConfig";
import { ProposedVersionEventArgs } from "../events/ProposedVersionEventArgs";
import { IgnorableRevert, IgnorableReverts } from "../types/IgnorableRevert";
import { VerifierStateManager } from "./VerifierStateManager";
import { VersionProcessingService } from "./VersionProcessingService";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TypedEvent {
  blockNumber: number;
  transactionIndex: number;
  logIndex: number;
  args: ProposedVersionEventArgs;
}

export class VerifierClient {
  private logger: Logger;
  private versionProcessingService: VersionProcessingService;
  private polywrapVotingSystem: PolywrapVotingSystem;
  private verifierStateManager: VerifierStateManager;
  private verifierClientConfig: VerifierClientConfig;

  constructor(deps: {
    logger: Logger;
    polywrapVotingSystem: PolywrapVotingSystem;
    versionProcessingService: VersionProcessingService;
    verifierStateManager: VerifierStateManager;
    verifierClientConfig: VerifierClientConfig;
  }) {
    this.logger = deps.logger;
    this.polywrapVotingSystem = deps.polywrapVotingSystem;
    this.versionProcessingService = deps.versionProcessingService;
    this.verifierStateManager = deps.verifierStateManager;
    this.verifierClientConfig = deps.verifierClientConfig;
  }

  @traceFunc("verifier-client:run")
  async run(): Promise<void> {
    this.logger.info(`Listening for VotingStarted events.`);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const [error, processedEvents] = await handleError(() =>
        this.queryAndVerifyVersions()
      )();

      if (error) {
        this.logger.error(`Critical Error: ${error.message}`);
        process.exit(1);
      } else {
        this.logger.info(
          `${processedEvents} proposed version events processed.`
        );

        await delay(this.verifierClientConfig.pauseTimeInMiliseconds);
      }
    }
  }

  @traceFunc("verifier-client:query_and_verify_versions")
  async queryAndVerifyVersions(): Promise<number> {
    const proposedVersionEvents = await this.polywrapVotingSystem.queryVersionVotingStarted(
      this.verifierStateManager.state.currentlyProcessingBlock
    );

    if (proposedVersionEvents.length) {
      this.logger.info(
        `Found ${proposedVersionEvents.length} VotingStarted events.`
      );
    }

    for (const event of proposedVersionEvents) {
      const typedEvent: TypedEvent = (event as unknown) as TypedEvent;

      const [error] = await handleContractError(() =>
        this.versionProcessingService.processProposedVersionEvent(
          this.verifierStateManager.state,
          typedEvent
        )
      )();

      console.log(error);

      if (error && (error as TransactionError).revertMessage) {
        const txError = error as TransactionError;
        const revertMessage = txError.revertMessage as IgnorableRevert;
        if (revertMessage && IgnorableReverts.includes(revertMessage)) {
          this.logger.warn(`Error: ${txError.message}`);
        } else {
          this.logger.error(`Critical Error: ${txError.message}`);
          process.exit(1);
        }
      } else if (error && (error as BaseContractError).reason) {
        const contractError = error as BaseContractError;
        const revertMessage = contractError.reason as IgnorableRevert;
        if (revertMessage && IgnorableReverts.includes(revertMessage)) {
          this.logger.warn(`Error: ${contractError.message}`);
        } else {
          this.logger.error(`Critical Error: ${contractError.message}`);
          process.exit(1);
        }
      } else if (error) {
        this.logger.error(`Critical Error: ${error.message}`);
        process.exit(1);
      } else {
        this.verifierStateManager.save();
      }
    }

    return proposedVersionEvents.length;
  }
}
