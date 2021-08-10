// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IVersionDecidedListener {
  function onVersionDecided(bytes32 proposedVersionId, bool verified) external;
}
