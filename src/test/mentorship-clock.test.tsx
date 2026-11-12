import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMentorshipAccount } from "@/lib/use-mentorship";
import { accountCanAccess, type MentorshipAccount } from "@/lib/mentorship";
const mock=vi.hoisted(()=>({get:vi.fn()}));
vi.mock("@/lib/mentorship-api",()=>({getMentorshipAccount:mock.get}));
const uid="00000000-0000-4000-8000-000000000002";
const start=Date.parse("2026-11-12T12:00:00Z");
function fixture(userId=uid):MentorshipAccount{return {user_id:userId,server_now:new Date(Date.now()).toISOString(),status:"active",legacy_expires_at:new Date(start+1000).toISOString(),has_access:true,plans:[],installments:[],receipts:[]};}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(start);vi.resetAllMocks();mock.get.mockImplementation(async(userId:string)=>fixture(userId));});
afterEach(()=>{cleanup();vi.useRealTimers();});
describe("Atualização do prazo sem recarregar a página",()=>{
 it("agenda o bloqueio no instante de vencimento",async()=>{const {result}=renderHook(()=>useMentorshipAccount(uid));await act(async()=>{await Promise.resolve();});expect(result.current.account).not.toBeNull();expect(accountCanAccess(result.current.account!,result.current.now)).toBe(true);await act(async()=>{await vi.advanceTimersByTimeAsync(1100);});expect(accountCanAccess(result.current.account!,result.current.now)).toBe(false);});
 it("não consulta pagamentos durante a demonstração",async()=>{renderHook(()=>useMentorshipAccount(null,false));await act(async()=>{await Promise.resolve();});expect(mock.get).not.toHaveBeenCalled();});
 it("não mistura dados quando o usuário muda durante uma requisição",async()=>{let finish:((value:MentorshipAccount)=>void)|undefined;mock.get.mockImplementationOnce(()=>new Promise<MentorshipAccount>((resolve)=>{finish=resolve;}));const {result,rerender}=renderHook(({userId})=>useMentorshipAccount(userId),{initialProps:{userId:uid}});const second="00000000-0000-4000-8000-000000000003";rerender({userId:second});await act(async()=>{await Promise.resolve();});await act(async()=>{finish?.(fixture(uid));await Promise.resolve();});expect(result.current.account?.user_id).toBe(second);});
});
