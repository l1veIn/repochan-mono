import { getRepoChanPiResources } from "repochan-pi/resources";

export { getRepoChanPiResources };

export type RepoChanCliResources = ReturnType<typeof getRepoChanCliResources>;

export function getRepoChanCliResources() {
  const resources = getRepoChanPiResources();
  return {
    ...resources,
    additionalExtensionPaths: [resources.extensionPath],
    additionalSkillPaths: [resources.skillsPath],
  };
}
