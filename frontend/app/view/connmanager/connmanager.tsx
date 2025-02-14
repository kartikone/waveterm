import { computeConnColorNum } from "@/app/block/blockutil";
import { atoms, createBlock, getApi } from "@/app/store/global";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import * as jotai from "jotai";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import React from "react";

class ConnManagerModel implements ViewModel {
    viewType = "connmanager";
    viewName = jotai.atom("Connections");
    viewIcon = jotai.atom("server");
    viewText = jotai.atom("Connection Status Overview");
    filterOutNowsh = jotai.atom(true);
    viewComponent = ConnManagerView;
    refreshTrigger = jotai.atom(0);
}

interface ConnectionRow {
    name: string;
    type: "ssh" | "wsl";
    status: ConnStatus;
    colorNum: number;
}

const StatusIcon: React.FC<{ status: ConnStatus }> = ({ status }) => {
    const getStatusStyle = () => {
        switch (status.status) {
            case "connected":
                return "text-success";
            case "error":
                return "text-error";
            case "connecting":
                return "text-warning";
            default:
                return "text-gray-500";
        }
    };

    return (
        <div className="relative inline-flex items-center">
            <div
                className={`w-2 h-2 rounded-full ${getStatusStyle()}`}
                style={{ backgroundColor: "currentColor" }}
                title={status.status === "error" && status.error ? status.error : status.status}
            />
        </div>
    );
};

const ActionButton: React.FC<{
    onClick: () => void;
    isIcon?: boolean;
    children?: React.ReactNode;
}> = ({ onClick, isIcon = false, children }) => (
    <button
        onClick={onClick}
        className={`
            border border-border rounded transition-colors duration-200 flex items-center justify-center
            ${
                isIcon
                    ? "w-7 h-7 p-0 hover:bg-hoverbg" // Smaller 1:1 icon button
                    : "px-2 py-1 text-xs hover:bg-success/10 hover:border-success hover:text-success"
            }
        `}
    >
        {isIcon ? (
            <i className="text-sm leading-none">{children}</i> // Ensures icons remain properly sized
        ) : (
            children
        )}
    </button>
);

const ConnManagerView: ViewComponent = ({ blockId, model }) => {
    const [connections, setConnections] = React.useState<ConnectionRow[]>([]);
    const allConnStatus = jotai.useAtomValue(atoms.allConnStatus);
    const refreshTrigger = jotai.useAtomValue((model as ConnManagerModel).refreshTrigger);

    React.useEffect(() => {
        const fetchData = async () => {
            try {
                const [remoteConns, wslConns] = await Promise.all([
                    RpcApi.ConnListCommand(TabRpcClient, { timeout: 2000 }),
                    RpcApi.WslListCommand(TabRpcClient, { timeout: 2000 }),
                ]);

                const connRows: ConnectionRow[] = [];

                remoteConns?.forEach((conn) => {
                    const status = allConnStatus.find((s) => s.connection === conn);
                    if (status) {
                        connRows.push({
                            name: conn,
                            type: "ssh",
                            status,
                            colorNum: computeConnColorNum(status),
                        });
                    }
                });

                wslConns?.forEach((conn) => {
                    const wslConn = `wsl://${conn}`;
                    const status = allConnStatus.find((s) => s.connection === wslConn);
                    if (status) {
                        connRows.push({
                            name: wslConn,
                            type: "wsl",
                            status,
                            colorNum: computeConnColorNum(status),
                        });
                    }
                });

                setConnections(connRows);
            } catch (error) {
                console.error("Error fetching connections:", error);
            }
        };

        fetchData();
    }, [allConnStatus, refreshTrigger]);

    const handleDisconnect = async (connName: string) => {
        try {
            await RpcApi.ConnDisconnectCommand(TabRpcClient, connName, { timeout: 60000 });
        } catch (error) {
            console.error("Error disconnecting:", error);
        }
    };

    const handleConnect = async (connName: string) => {
        try {
            await RpcApi.ConnConnectCommand(TabRpcClient, { host: connName, logblockid: blockId }, { timeout: 60000 });
        } catch (error) {
            console.error("Error connecting:", error);
        }
    };

    const handleEdit = async (connName: string) => {
        const path = `${getApi().getConfigDir()}/connections.json`;
        const blockDef: BlockDef = {
            meta: {
                view: "preview",
                file: path,
            },
        };
        await createBlock(blockDef, false, true);
    };

    return (
        <div className="h-full">
            <OverlayScrollbarsComponent defer className="h-full">
                <div className="p-4">
                    <div className="min-w-[600px] overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-left p-2 w-16">Status</th>
                                    <th className="text-left p-2 w-12">Type</th>
                                    <th className="text-left p-2">Connection</th>
                                    <th className="text-right p-2 w-32">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {connections.map((conn) => (
                                    <tr key={conn.name} className="border-b border-border hover:bg-hoverbg">
                                        <td className="p-2">
                                            <StatusIcon status={conn.status} />
                                        </td>
                                        <td className="p-2">{conn.type}</td>
                                        <td className="p-2 text-left">
                                            <span
                                                className="truncate"
                                                style={{
                                                    color:
                                                        conn.status.status === "connected"
                                                            ? `var(--conn-icon-color-${conn.colorNum})`
                                                            : undefined,
                                                }}
                                                title={conn.name}
                                            >
                                                {conn.name}
                                            </span>
                                        </td>
                                        <td className="p-2 text-right">
                                            <div className="flex justify-end items-center gap-2">
                                                {conn.status.status === "connected" ? (
                                                    <ActionButton onClick={() => handleDisconnect(conn.name)}>
                                                        Disconnect
                                                    </ActionButton>
                                                ) : (
                                                    <ActionButton onClick={() => handleConnect(conn.name)}>
                                                        {conn.status.status === "init" ? "Connect" : "Reconnect"}
                                                    </ActionButton>
                                                )}
                                                <ActionButton onClick={() => handleEdit(conn.name)} isIcon>
                                                    <i className="fa fa-pencil text-xs fa-fw" />
                                                </ActionButton>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </OverlayScrollbarsComponent>
        </div>
    );
};

export { ConnManagerModel };
