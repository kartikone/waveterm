import { computeConnColorNum } from "@/app/block/blockutil";
import { atoms, createBlock, getApi } from "@/app/store/global";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import * as jotai from "jotai";
import React from "react";

class ConnManagerModel implements ViewModel {
    viewType = "connmanager";
    viewName = jotai.atom("Connections");
    viewIcon = jotai.atom("server");
    viewText = jotai.atom("Connection Status Overview");
    filterOutNowsh = jotai.atom(true);
    viewComponent = ConnManagerView;

    // Additional atoms for managing table state
    refreshTrigger = jotai.atom(0);
}

interface ConnectionRow {
    name: string;
    type: "ssh" | "wsl";
    status: ConnStatus;
    colorNum: number;
}

const ConnManagerView: ViewComponent = ({ blockId, model }) => {
    const [connections, setConnections] = React.useState<ConnectionRow[]>([]);
    const allConnStatus = jotai.useAtomValue(atoms.allConnStatus);
    const refreshTrigger = jotai.useAtomValue((model as ConnManagerModel).refreshTrigger);
    console.log("allconnstatus", allConnStatus);

    // Fetch connections data
    React.useEffect(() => {
        const fetchData = async () => {
            try {
                const [remoteConns, wslConns] = await Promise.all([
                    RpcApi.ConnListCommand(TabRpcClient, { timeout: 2000 }),
                    RpcApi.WslListCommand(TabRpcClient, { timeout: 2000 }),
                ]);

                const connRows: ConnectionRow[] = [];

                // Add remote connections
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

                // Add WSL connections
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

    const handleReconnect = async (connName: string) => {
        try {
            await RpcApi.ConnConnectCommand(TabRpcClient, { host: connName, logblockid: blockId }, { timeout: 60000 });
        } catch (error) {
            console.error("Error reconnecting:", error);
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

    const getStatusColor = (status: string) => {
        switch (status) {
            case "connected":
                return "text-success";
            case "error":
                return "text-error";
            case "disconnected":
                return "text-warning";
            default:
                return "";
        }
    };

    return (
        <div className="p-4">
            <table className="w-full">
                <thead>
                    <tr className="border-b border-border">
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-left p-2">Connection</th>
                        <th className="text-right p-2">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {connections.map((conn) => (
                        <tr key={conn.name} className="border-b border-border hover:bg-hoverbg">
                            <td className="p-2">
                                <span className={getStatusColor(conn.status.status)}>{conn.status.status}</span>
                            </td>
                            <td className="p-2">{conn.type}</td>
                            <td className="p-2">
                                <span
                                    style={{
                                        color:
                                            conn.status.status === "connected"
                                                ? `var(--conn-icon-color-${conn.colorNum})`
                                                : undefined,
                                    }}
                                >
                                    {conn.name}
                                </span>
                            </td>
                            <td className="p-2 text-right space-x-2">
                                <>
                                    {conn.status.status === "connected" ? (
                                        <button
                                            onClick={() => handleDisconnect(conn.name)}
                                            className="px-2 py-1 text-sm rounded hover:bg-hoverbg"
                                            title="Disconnect"
                                        >
                                            Disconnect
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleReconnect(conn.name)}
                                            className="px-2 py-1 text-sm rounded hover:bg-hoverbg"
                                            title="Reconnect"
                                        >
                                            Reconnect
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleEdit(conn.name)}
                                        className="px-2 py-1 text-sm rounded hover:bg-hoverbg"
                                        title="Edit"
                                    >
                                        Edit
                                    </button>
                                </>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export { ConnManagerModel };
