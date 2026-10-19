import assert from 'node:assert/strict';
import {expect} from '@playwright/test';

export async function checkSelectionToolbar(page) {
  const viewport=page.viewportSize();
  const wasDark=await page.locator('html').evaluate(root=>root.classList.contains('dark'));
  const toolbar=page.locator('.app-selection-toolbar');
  try {
    for(const dark of [false,true]) {
      await page.locator('html').evaluate((root,dark)=>root.classList.toggle('dark',dark),dark);
      for(const width of [1280,390,320]) {
        await page.setViewportSize({width,height:844});
        const select=toolbar.getByRole('button',{name:'Select all filtered',exact:true});
        const clear=toolbar.getByRole('button',{name:'Clear selection',exact:true});
        const download=toolbar.getByRole('button',{name:'Download (.zip)',exact:true});
        const reference=await download.evaluate(button=>({border:getComputedStyle(button).borderColor,radius:getComputedStyle(button).borderRadius}));
        for(const button of [select,clear]) {
          await expect(button).toBeVisible();
          assert.deepEqual(await button.evaluate(button=>({border:getComputedStyle(button).borderColor,radius:getComputedStyle(button).borderRadius})),reference);
        }
        const buttons=await toolbar.getByRole('button').evaluateAll(buttons=>buttons.map(button=>{
          const bounds=button.getBoundingClientRect();return {x:bounds.x,right:bounds.right,y:bounds.y,height:bounds.height,overflow:button.scrollWidth>button.clientWidth};
        }));
        for(const button of buttons) {assert.ok(button.x>=0&&button.right<=width,'Selection controls must fit the viewport');assert.ok(!button.overflow,'Button labels must fit');}
        if(width===1280) {
          assert.ok(buttons.every(button=>Math.abs(button.y-buttons[0].y)<=2),'Desktop selection controls must align on one row');
          assert.ok(buttons.every(button=>Math.abs(button.height-buttons[0].height)<=2),'Selection controls must have matching heights');
        }
        await select.click();await expect(toolbar.getByText('Selected: 1',{exact:true})).toBeVisible();
        await clear.click();await expect(toolbar.getByText('Selected: 0',{exact:true})).toBeVisible();
        await page.screenshot({path:`artifacts/selection-${page.url().includes('native.html')?'native':'web'}-${dark?'dark':'light'}-${width}.png`,animations:'disabled'});
      }
    }
  } finally {
    await page.locator('html').evaluate((root,dark)=>root.classList.toggle('dark',dark),wasDark);
    await page.setViewportSize(viewport);
  }
}
