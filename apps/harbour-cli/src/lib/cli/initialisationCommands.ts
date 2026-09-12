const initialisationCommands = {
  'init:minimal': {
    script: 'scripts/init/minimal.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  init: {
    script: 'scripts/init/all.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:local': {
    script: 'scripts/init/local.fish',
    supportsContinue: false,
    supportsTarget: false,
  },
  'init:production': {
    script: 'scripts/init/production.fish',
    supportsContinue: false,
    supportsTarget: false,
  },
  'init:addresses': {
    script: 'scripts/init/addresses.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:addresses:saanseoi': {
    script: 'scripts/init/addresses-hkgov-dpo.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:stats:government': {
    script: 'scripts/init/stats-hkgov-censtatd.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:stats': {
    script: 'scripts/init/stats.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:divisions': {
    script: 'scripts/init/divisions.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:divisions:hkgov-pland-new-town': {
    script: 'scripts/init/divisions-hkgov-pland-new-town.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:divisions:hkgov-pland-pu': {
    script: 'scripts/init/divisions-hkgov-pland-pu.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:divisions:hkgov-landsd': {
    script: 'scripts/init/divisions-hkgov-landsd.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:divisions:geographic': {
    script: 'scripts/init/divisions-overture.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:divisions:hkgov-censtatd-hma': {
    script: 'scripts/init/divisions-hkgov-censtatd-hma.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:places:overture': {
    script: 'scripts/init/places-overture.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:places': {
    script: 'scripts/init/places.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:streets:saanseoi': {
    script: 'scripts/init/streets-hkgov-landsd.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:streets': {
    script: 'scripts/init/streets.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
} as const

export type InitialisationCommand = keyof typeof initialisationCommands

export function resolveInitialisationCommand(command: string) {
  return initialisationCommands[command as InitialisationCommand]
}
