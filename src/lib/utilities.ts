import { MsgResource } from "@worldware/msg";

type GroupedMsgResources = {
  [projectName: string]: MsgResource[]
}
export async function findMsgResourceFiles(directory: string): Promise<string[]> {

}

export async function importMsgResources(filePaths: string[]): Promise<GroupedMsgResources[]> {

}

export function MsgProjectResourcesToXliff(resources: MsgResource[]): string {

}

export function XliffToMsgProjectResourcesTranslations(xliff: string, locale: string): MsgResource[] {

}

export async function writeXliff(filePath: string, xliff: string): Promise<void> {

}

export async function readXliffFile(filePath:string): Promise<string> {
  
}