const sha256Pattern = /^[a-f0-9]{64}$/;

const denied = (reasonCode) => ({ allowed: false, reasonCode });
const isText = (value) => typeof value === 'string' && value.trim().length > 0;

export function resolveDeviceTarget({ configuredTargets, observedDevices, alias }) {
  if (!isText(alias)) return denied('TARGET_REQUIRED');
  if (!Array.isArray(configuredTargets) || !Array.isArray(observedDevices)) return denied('TARGET_DATA_INVALID');

  const configured = configuredTargets.filter((target) => target?.alias === alias);
  if (configured.length === 0) return denied('TARGET_NOT_CONFIGURED');
  if (configured.length !== 1) return denied('TARGET_ALIAS_AMBIGUOUS');
  const identityHash = configured[0].deviceIdHash;
  if (typeof identityHash !== 'string' || !sha256Pattern.test(identityHash)) return denied('TARGET_IDENTITY_INVALID');

  const observed = observedDevices.filter((device) => device?.deviceIdHash === identityHash);
  if (observed.length === 0) return denied('TARGET_NOT_OBSERVED');
  if (observed.length !== 1) return denied('TARGET_OBSERVATION_AMBIGUOUS');

  return {
    allowed: true,
    target: {
      alias,
      deviceIdHash: identityHash,
      model: isText(observed[0].model) ? observed[0].model : null,
      osVersion: isText(observed[0].osVersion) ? observed[0].osVersion : null,
    },
  };
}

export function decideLeaseAcquisition({ leases, targetDeviceIdHash, taskId, agentId, leaseId, now, ttlMs, maxLeaseMs, activeOperationState = 'unknown' }) {
  if (!Array.isArray(leases) || !sha256Pattern.test(targetDeviceIdHash ?? '') ||
      ![taskId, agentId, leaseId].every(isText) || !Number.isSafeInteger(now) ||
      !Number.isSafeInteger(ttlMs) || !Number.isSafeInteger(maxLeaseMs) || ttlMs <= 0 || ttlMs > maxLeaseMs ||
      !Number.isSafeInteger(now + ttlMs) || leases.some((lease) => lease?.leaseId === leaseId)) {
    return denied('LEASE_REQUEST_INVALID');
  }

  const targetLeases = leases.filter((lease) => lease?.targetDeviceIdHash === targetDeviceIdHash);
  if (targetLeases.length > 1) return denied('LEASE_STATE_AMBIGUOUS');
  const existing = targetLeases[0];
  if (existing && (!Number.isSafeInteger(existing.expiresAt) || existing.expiresAt > now)) return denied('LEASE_BUSY');
  if (existing && activeOperationState !== 'inactive') {
    return denied(activeOperationState === 'active' ? 'LEASE_OPERATION_ACTIVE' : 'LEASE_STATE_UNVERIFIED');
  }

  return {
    allowed: true,
    lease: { leaseId, targetDeviceIdHash, taskId, agentId, startedAt: now, expiresAt: now + ttlMs },
    reclaimedLeaseId: existing?.leaseId ?? null,
  };
}

export function decideLeaseRelease({ lease, leaseId, targetDeviceIdHash, taskId, agentId }) {
  if (!lease || ![leaseId, taskId, agentId].every(isText) || !sha256Pattern.test(targetDeviceIdHash ?? '')) {
    return denied('LEASE_RELEASE_INVALID');
  }
  if (lease.leaseId !== leaseId || lease.targetDeviceIdHash !== targetDeviceIdHash ||
      lease.taskId !== taskId || lease.agentId !== agentId) return denied('LEASE_OWNER_MISMATCH');
  return { allowed: true, event: 'released', leaseId, targetDeviceIdHash, taskId, agentId };
}

const deviceOperations = new Set([
  'verifyDevice', 'captureScreenshot', 'inspectUiHierarchy', 'getDiagnostics', 'startLogCapture', 'stopLogCapture',
  'deployApp', 'sendKey', 'sendKeySequence', 'reboot', 'factoryReset',
  'firmwareUpdate', 'credentialChange', 'signArtifact', 'networkChange',
]);
const disruptiveOperations = new Set([
  'deployApp', 'sendKey', 'sendKeySequence', 'reboot', 'factoryReset',
  'firmwareUpdate', 'credentialChange', 'signArtifact', 'networkChange', 'startLogCapture',
]);
const highRiskOperations = new Set([
  'reboot', 'factoryReset', 'firmwareUpdate', 'credentialChange', 'signArtifact', 'networkChange',
]);

export function authorizeDeviceOperation({ operation, target, taskId, agentId, now, authorization, lease, maintenanceWindow, sideloadReplacementApproved = false }) {
  if (!deviceOperations.has(operation)) return denied('OPERATION_UNSUPPORTED');
  if (operation === 'factoryReset') return denied('OPERATION_NEVER_AUTOMATED');
  if (!target || !isText(target.alias) || !sha256Pattern.test(target.deviceIdHash ?? '')) return denied('TARGET_UNVERIFIED');
  if (!isText(taskId) || !isText(agentId) || !Number.isSafeInteger(now)) return denied('AUTHORIZATION_CONTEXT_INVALID');

  if (!authorization || authorization.approved !== true || !isText(authorization.approvalId) ||
      !isText(authorization.approvedBy) || authorization.operation !== operation ||
      authorization.taskId !== taskId || authorization.targetDeviceIdHash !== target.deviceIdHash ||
      !Number.isSafeInteger(authorization.expiresAt) || authorization.expiresAt <= now) {
    return denied('OPERATION_NOT_AUTHORIZED');
  }

  if (operation !== 'verifyDevice' && (!lease || lease.leaseId === undefined ||
      lease.targetDeviceIdHash !== target.deviceIdHash || lease.taskId !== taskId ||
      lease.agentId !== agentId || !Number.isSafeInteger(lease.expiresAt) || lease.expiresAt <= now)) {
    return denied('LEASE_REQUIRED');
  }
  if (disruptiveOperations.has(operation) &&
      (!maintenanceWindow || !Number.isSafeInteger(maintenanceWindow.startsAt) ||
       !Number.isSafeInteger(maintenanceWindow.endsAt) || now < maintenanceWindow.startsAt || now >= maintenanceWindow.endsAt)) {
    return denied('MAINTENANCE_WINDOW_REQUIRED');
  }
  if (operation === 'deployApp' && sideloadReplacementApproved !== true) return denied('SIDELOAD_REPLACEMENT_NOT_APPROVED');
  if (highRiskOperations.has(operation) && authorization.highRiskApproved !== true) return denied('HIGH_RISK_APPROVAL_REQUIRED');

  return { allowed: true, operation, targetDeviceIdHash: target.deviceIdHash };
}