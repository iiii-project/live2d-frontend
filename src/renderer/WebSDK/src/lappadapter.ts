// @ts-nocheck
import { LAppLive2DManager } from "./lapplive2dmanager";
import { LAppModel } from "./lappmodel";
import { LAppDelegate } from "./lappdelegate";
import * as LAppDefine from './lappdefine';
import { LAppPal } from "./lapppal";

import {
  ACubismMotion,
  FinishedMotionCallback
} from '@framework/motion/acubismmotion';
import {
  CubismMotionQueueEntryHandle,
  InvalidMotionQueueEntryHandleValue
} from '@framework/motion/cubismmotionqueuemanager';
import { CubismFramework } from '@framework/live2dcubismframework';
import { deprecate } from "util";

export let s_adapter_instance : LAppAdapter | null | undefined = null;

export class LAppAdapter {
  public static getInstance(): LAppAdapter {
    if (s_adapter_instance == null) {
      s_adapter_instance = new LAppAdapter();
    }

    return s_adapter_instance;
  }

  /* gets */

  public getMgr(): LAppLive2DManager {
    return LAppLive2DManager.getInstance();
  }

  public getModel(): LAppModel | null {
    return this.getMgr().getModel(0);
  }

  public getIdManager() {
    return CubismFramework.getIdManager();
  }

  /* motion */

  public getMotionGroups(): string[] {
    let groups : string[] = [];
    for (let i = 0; i < this.getModel()?._modelSetting.getMotionGroupCount(); i++) {
      groups.push(this.getModel()?._modelSetting.getMotionGroupName(i) ?? "");
    }
    return groups;
  }

  public getMotionCount(group: string): number {
    return this.getModel()?._modelSetting.getMotionCount(group) ?? 0;
  }

  public startMotion(
    group: string,
    no: number,
    priority: number,
    onFinishedMotionHandler?: FinishedMotionCallback
  ): CubismMotionQueueEntryHandle {
    return this.getModel()?.startMotion(group, no, priority, onFinishedMotionHandler) ?? InvalidMotionQueueEntryHandleValue;
  }

  /* expression */

  public getExpressionCount(): number {
    return this.getModel()?._expressions.getSize() ?? 0;
  }

  public getExpressionName(index: number): string {
    return this.getModel()?._modelSetting?.getExpressionName(index) ?? '';
  }

  public setExpression(name: string): void {
    this.getModel()?.setExpression(name);
  }

  /* hit testing (mirrors the coordinate pipeline used by mouse tap handling
     in use-live2d-model.ts, factored out here so any input source — mouse,
     hand tracking — can drive it with plain viewport clientX/clientY) */

  public getCanvasRect(): DOMRect | null {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
    return canvas ? canvas.getBoundingClientRect() : null;
  }

  // Converts viewport clientX/clientY into Cubism "screen"/model coordinates
  // — the same conversion used for both mouse hit-testing and mouse-drag
  // repositioning in use-live2d-model.ts.
  public screenToModel(clientX: number, clientY: number): { x: number, y: number } | null {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
    const view = LAppDelegate.getInstance().getView();
    if (!canvas || !view) return null;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const scale = canvas.width / canvas.clientWidth;
    return {
      x: view._deviceToScreen.transformX(x * scale),
      y: view._deviceToScreen.transformY(y * scale),
    };
  }

  public hitTest(clientX: number, clientY: number): string | null {
    const model = this.getModel();
    const modelPos = this.screenToModel(clientX, clientY);
    if (!model || !modelPos) return null;

    return model.anyhitTest(modelPos.x, modelPos.y);
  }

  public startTapMotion(hitAreaName: string, tapMotionsConfig: Record<string, Record<string, number>>): void {
    this.getModel()?.startTapMotion(hitAreaName, tapMotionsConfig);
  }

  // @deprecated
  public nextChara(): void {
    this.getMgr().nextScene();
  }

  public setChara(ModelDir: string, ModelName: string): void {
    const modelPath = (ModelDir.endsWith('/') ? ModelDir : ModelDir + '/') + ModelName + '/';
    const modelJsonName = ModelName + '.model3.json';

    if (LAppDefine.DebugLogEnable) {
      LAppPal.printMessage(`[APP]model Dir: ${modelPath}`);
    }

    this.getMgr().releaseAllModel();
    this.getMgr()._models.pushBack(new LAppModel());
    this.getMgr()._models.at(0)?.loadAssets(modelPath, modelJsonName);
  }

  /* model position manipulation */
  
  public getModelPosition(): { x: number, y: number } {
    const model = this.getModel();
    if (model && model._modelMatrix) {
      const matrix = model._modelMatrix.getArray();
      return {
        x: matrix[12],
        y: matrix[13]
      };
    }
    return { x: 0, y: 0 };
  }
  
  public setModelPosition(x: number, y: number): void {
    const model = this.getModel();
    if (model && model._modelMatrix) {
      const matrix = model._modelMatrix.getArray();
      
      // Update the translation components
      const newMatrix = [...matrix];
      newMatrix[12] = x;
      newMatrix[13] = y;
      
      // Set the matrix
      model._modelMatrix.setMatrix(newMatrix);
    }
  }

  // private _live2DMgr: LAppLive2DManager;
}